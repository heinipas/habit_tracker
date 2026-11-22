import hmac

from fastapi import Header, HTTPException

_SCHEME = "Bearer "


def make_require_api_key(api_key: str):
    """Build the Bearer-token dependency with a constant-time key comparison."""
    expected = api_key.encode("utf-8")

    def require_api_key(authorization: str | None = Header(default=None)) -> None:
        if authorization is None or not authorization.startswith(_SCHEME):
            raise HTTPException(
                status_code=401,
                detail="Missing bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        presented = authorization[len(_SCHEME) :].encode("utf-8")
        if not hmac.compare_digest(presented, expected):
            raise HTTPException(
                status_code=401,
                detail="Invalid API key",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return require_api_key
