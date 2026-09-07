from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    title: str = Field(..., min_length=1)
    abstract: str = ""
    text: str = Field(..., min_length=20)


class RuleResult(BaseModel):
    score: int
    flags: list[str]
    passed: bool


class AnalyzeResponse(BaseModel):
    summary: str
    keywords: list[str]
    suggested_improvements: list[str]
    rules: RuleResult


class OtpSendRequest(BaseModel):
    email: str = Field(..., min_length=3)
    purpose: str = Field(..., pattern="^(verify_email|reset_password)$")


class OtpVerifyRequest(BaseModel):
    email: str = Field(..., min_length=3)
    purpose: str = Field(..., pattern="^(verify_email|reset_password)$")
    code: str = Field(..., min_length=6, max_length=6)


class RegisterCheckRequest(BaseModel):
    """Pre-flight availability check, run before a signup code is emailed."""

    email: str = Field(..., min_length=3, max_length=254)
    username: str = Field(..., min_length=1, max_length=40)


class RegisterRequest(BaseModel):
    signup_token: str = Field(..., min_length=1)
    first_name: str = Field(..., min_length=1, max_length=40)
    middle_name: str = Field("", max_length=40)
    last_name: str = Field(..., min_length=1, max_length=40)
    username: str = Field(..., min_length=1, max_length=40)
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=8, max_length=128)


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(..., min_length=1)
    email: str = Field(..., min_length=3, max_length=254)
    new_password: str = Field(..., min_length=8, max_length=128)


class ComplianceScanRequest(BaseModel):
    mechanics_id: str = Field(..., min_length=1)


class MechanicsRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class MechanicsSaveRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    rules: dict = Field(default_factory=dict)
    source_filename: str | None = Field(default=None, max_length=300)
    file_type: str | None = Field(default=None, max_length=40)
    extracted_text: str | None = Field(default=None, max_length=200_000)


class UpdateProfileRequest(BaseModel):
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    contact_number: str | None = None
    username: str | None = None
    photo_url: str | None = None
    remove_photo: bool = False


class SubscribeRequest(BaseModel):
    plan: str = Field(..., pattern="^(free|premium)$")
    billing_period: str | None = Field(default="monthly", pattern="^(monthly|annual)$")
    payment_method: str | None = Field(default="card", pattern="^(card|gcash|maya)$")


class CancelSubscriptionRequest(BaseModel):
    immediate: bool = True
