from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class LoanNPCRequest(BaseModel):
    amount: float = Field(gt=0, le=500, description="Loan amount from NPC bank")


class LoanOfferRequest(BaseModel):
    target_user_id: int
    amount: float = Field(gt=0, le=500)
    interest_rate: float = Field(ge=0, le=1.0, default=0.20)


class LoanRepayRequest(BaseModel):
    amount: float = Field(gt=0)


class LoanResponse(BaseModel):
    loan_id: int
    lender: str  # "NPC_BANK" or username
    lender_id: Optional[int] = None
    borrower_id: int
    amount: float
    interest_rate: float
    amount_due: float
    amount_paid: float
    status: str
    created_at: Optional[datetime] = None


class LoanRepayResponse(BaseModel):
    loan_id: int
    amount_paid: float
    amount_remaining: float
    status: str
    new_balance: float


class LoanListResponse(BaseModel):
    loans_as_borrower: List[LoanResponse]
    loans_as_lender: List[LoanResponse]


class FavorResponse(BaseModel):
    id: int
    type: str
    remaining_races: int
    is_active: bool
