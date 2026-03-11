from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, constr
from sqlalchemy.orm import Session

from authlib.integrations.starlette_client import OAuth

from .auth import (
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from .auth_config import settings
from .db import get_db
from .models import SocialAccount, User


router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
GOOGLE_OAUTH_ENABLED = bool(settings.google_client_id and settings.google_client_secret)
if GOOGLE_OAUTH_ENABLED:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


class RegisterRequest(BaseModel):
    email: EmailStr
    password: constr(min_length=8)
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None

    class Config:
        orm_mode = True


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists.",
        )
    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        name=payload.name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    token = create_access_token(user.id)
    set_auth_cookie(response, token)
    return user


@router.post("/logout")
def logout(response: Response):
    clear_auth_cookie(response)
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/oauth/{provider}/start")
async def oauth_start(request: Request, provider: str):
    if provider != "google":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"OAuth login for '{provider}' is not configured yet.",
        )
    if not GOOGLE_OAUTH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
    redirect_uri = request.url_for("oauth_callback", provider="google")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/oauth/{provider}/callback", name="oauth_callback")
async def oauth_callback(
    request: Request,
    provider: str,
    db: Session = Depends(get_db),
):
    if provider != "google":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"OAuth callback for '{provider}' is not configured yet.",
        )
    if not GOOGLE_OAUTH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

    # Exchange code for tokens and fetch user info
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo:
        # Fallback to ID token if userinfo missing
        try:
            userinfo = await oauth.google.parse_id_token(request, token)
        except Exception as exc:  # pragma: no cover - defensive
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to obtain Google user info: {exc}",
            )

    email = (userinfo.get("email") or "").lower()
    sub = userinfo.get("sub") or userinfo.get("id")
    name = userinfo.get("name")

    if not email or not sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account did not provide required identifiers.",
        )

    # Find or create user and social account link
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Social-only account; generate an internal password
        user = User(
            email=email,
            hashed_password=hash_password(sub),
            name=name,
        )
        db.add(user)
        db.flush()

    link = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.provider == "google",
            SocialAccount.provider_user_id == sub,
        )
        .first()
    )
    if not link:
        link = SocialAccount(
            provider="google",
            provider_user_id=sub,
            user_id=user.id,
        )
        db.add(link)

    db.commit()

    # Issue JWT and set auth cookie
    response = Response(status_code=status.HTTP_302_FOUND)
    token_str = create_access_token(user.id)
    set_auth_cookie(response, token_str)
    response.headers["Location"] = "/"
    return response

