from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.db.repository import Repository
from app.core.idempotency import IdempotencyManager
from app.schemas import loans as loan_schemas
from app.settings import settings
from app.api.auth import get_current_user
from typing import List

router = APIRouter(prefix="/loans", tags=["loans"])


def _get_user_total_debt(db: Session, user_id: int) -> float:
    """Sum of all active loans where user is borrower."""
    active_loans = db.query(models.Loan).filter(
        models.Loan.borrower_id == user_id,
        models.Loan.status.in_(["Active", "Pending"]),
    ).all()
    return sum((l.amount_due or 0) - (l.amount_paid or 0) for l in active_loans)


def _loan_to_response(loan: models.Loan, db: Session) -> dict:
    """Convert a Loan model to response dict."""
    if loan.lender_id is None:
        lender_name = "NPC_BANK"
    else:
        lender = db.query(models.User).filter(models.User.id == loan.lender_id).first()
        lender_name = lender.username if lender else f"user_{loan.lender_id}"
    
    return {
        "loan_id": loan.id,
        "lender": lender_name,
        "lender_id": loan.lender_id,
        "borrower_id": loan.borrower_id,
        "amount": loan.amount,
        "interest_rate": loan.interest_rate,
        "amount_due": loan.amount_due or 0,
        "amount_paid": loan.amount_paid or 0,
        "status": loan.status,
        "created_at": loan.created_at,
    }


@router.post("/npc", response_model=loan_schemas.LoanResponse)
def request_npc_loan(
    request: loan_schemas.LoanNPCRequest,
    user_id: int = Depends(get_current_user),
    x_idempotency_key: str = Header(...),
    db: Session = Depends(get_db),
):
    """Borrow from NPC Bank. Fixed interest rate, max 1 active NPC loan."""
    # Idempotency
    cached = IdempotencyManager.check_or_reserve(db, user_id, x_idempotency_key, "/loans/npc", request.model_dump())
    if cached:
        return cached

    # Check for existing active NPC loan
    existing = db.query(models.Loan).filter(
        models.Loan.borrower_id == user_id,
        models.Loan.lender_id == None,
        models.Loan.status == "Active",
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya tiene un préstamo NPC activo")

    # Check total debt cap
    total_debt = _get_user_total_debt(db, user_id)
    amount_due = round(request.amount * (1 + settings.NPC_INTEREST_RATE), 2)
    if total_debt + amount_due > settings.MAX_TOTAL_DEBT:
        raise HTTPException(
            status_code=400,
            detail=f"Deuda máxima excedida: actual ${total_debt:.2f} + nuevo ${amount_due:.2f} > max ${settings.MAX_TOTAL_DEBT}"
        )

    # Create loan and credit wallet
    with db.begin_nested():
        loan = models.Loan(
            lender_id=None,  # NPC
            borrower_id=user_id,
            amount=request.amount,
            interest_rate=settings.NPC_INTEREST_RATE,
            amount_due=amount_due,
            amount_paid=0.0,
            status="Active",
        )
        db.add(loan)
        db.flush()

        wallet = Repository.get_user_wallet_with_lock(db, user_id)
        wallet.balance_total += request.amount

        Repository.create_audit_log(
            db, user_id, "LOAN_NPC_CREATED",
            {"balance_total": request.amount},
            {"loan_id": loan.id, "amount": request.amount, "amount_due": amount_due},
            x_idempotency_key,
        )

    db.commit()
    db.refresh(loan)

    response = _loan_to_response(loan, db)
    response["new_balance"] = wallet.balance_total
    IdempotencyManager.save_response(db, user_id, x_idempotency_key, "/loans/npc", request.model_dump(mode='json'), response)
    return response


@router.post("/offer", response_model=loan_schemas.LoanResponse)
def offer_p2p_loan(
    request: loan_schemas.LoanOfferRequest,
    user_id: int = Depends(get_current_user),
    x_idempotency_key: str = Header(...),
    db: Session = Depends(get_db),
):
    """Offer a P2P loan. Funds are locked until accepted or expired."""
    cached = IdempotencyManager.check_or_reserve(db, user_id, x_idempotency_key, "/loans/offer", request.model_dump())
    if cached:
        return cached

    if request.target_user_id == user_id:
        raise HTTPException(status_code=400, detail="No puedes prestarte a ti mismo")

    # Check lender has funds
    wallet = Repository.get_user_wallet_with_lock(db, user_id)
    available = wallet.balance_total - wallet.balance_locked
    if available < request.amount:
        raise HTTPException(status_code=400, detail=f"Fondos insuficientes: disponible ${available:.2f}")

    # Check target exists
    target = db.query(models.User).filter(models.User.id == request.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario destino no encontrado")

    amount_due = round(request.amount * (1 + request.interest_rate), 2)

    with db.begin_nested():
        loan = models.Loan(
            lender_id=user_id,
            borrower_id=request.target_user_id,
            amount=request.amount,
            interest_rate=request.interest_rate,
            amount_due=amount_due,
            amount_paid=0.0,
            status="Pending",
        )
        db.add(loan)

        # Lock lender's funds
        wallet.balance_locked += request.amount

        Repository.create_audit_log(
            db, user_id, "LOAN_P2P_OFFERED",
            {"balance_locked": request.amount},
            {"loan_id": loan.id, "target_user_id": request.target_user_id, "amount": request.amount},
            x_idempotency_key,
        )

    db.commit()
    db.refresh(loan)

    response = _loan_to_response(loan, db)
    IdempotencyManager.save_response(db, user_id, x_idempotency_key, "/loans/offer", request.model_dump(mode='json'), response)
    return response


@router.post("/{loan_id}/accept", response_model=loan_schemas.LoanResponse)
def accept_loan(
    loan_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept a pending P2P loan offer."""
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Préstamo no encontrado")
    if loan.borrower_id != user_id:
        raise HTTPException(status_code=403, detail="Solo el deudor puede aceptar")
    if loan.status != "Pending":
        raise HTTPException(status_code=400, detail=f"Préstamo en estado '{loan.status}', no se puede aceptar")

    # Check borrower's debt cap
    total_debt = _get_user_total_debt(db, user_id)
    remaining_due = (loan.amount_due or 0) - (loan.amount_paid or 0)
    if total_debt + remaining_due > settings.MAX_TOTAL_DEBT:
        raise HTTPException(status_code=400, detail="Aceptar excedería tu deuda máxima")

    with db.begin_nested():
        loan.status = "Active"

        # Transfer: unlock lender's funds & deduct, credit borrower
        if loan.lender_id:
            lender_wallet = Repository.get_user_wallet_with_lock(db, loan.lender_id)
            lender_wallet.balance_locked -= loan.amount
            lender_wallet.balance_total -= loan.amount

        borrower_wallet = Repository.get_user_wallet_with_lock(db, user_id)
        borrower_wallet.balance_total += loan.amount

        Repository.create_audit_log(
            db, user_id, "LOAN_P2P_ACCEPTED",
            {"balance_total": loan.amount},
            {"loan_id": loan.id, "lender_id": loan.lender_id},
        )

    db.commit()
    db.refresh(loan)

    response = _loan_to_response(loan, db)
    response["new_balance"] = borrower_wallet.balance_total
    return response


@router.post("/{loan_id}/repay", response_model=loan_schemas.LoanRepayResponse)
def repay_loan(
    loan_id: int,
    request: loan_schemas.LoanRepayRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Repay (partially or fully) an active loan."""
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Préstamo no encontrado")
    if loan.borrower_id != user_id:
        raise HTTPException(status_code=403, detail="Solo el deudor puede pagar")
    if loan.status != "Active":
        raise HTTPException(status_code=400, detail=f"Préstamo en estado '{loan.status}'")

    remaining = (loan.amount_due or 0) - (loan.amount_paid or 0)
    payment = min(request.amount, remaining)  # Don't overpay

    with db.begin_nested():
        borrower_wallet = Repository.get_user_wallet_with_lock(db, user_id)
        available = borrower_wallet.balance_total - borrower_wallet.balance_locked
        if available < payment:
            raise HTTPException(status_code=400, detail=f"Fondos insuficientes: disponible ${available:.2f}")

        # Deduct from borrower
        borrower_wallet.balance_total -= payment
        loan.amount_paid = (loan.amount_paid or 0) + payment

        # Credit to lender (if P2P)
        if loan.lender_id:
            lender_wallet = Repository.get_user_wallet_with_lock(db, loan.lender_id)
            lender_wallet.balance_total += payment

        # Check if fully paid
        new_remaining = (loan.amount_due or 0) - loan.amount_paid
        if new_remaining <= 0.01:  # Float tolerance
            loan.status = "Paid"
            new_remaining = 0

        Repository.create_audit_log(
            db, user_id, "LOAN_REPAID",
            {"balance_total": -payment},
            {"loan_id": loan.id, "payment": payment, "remaining": new_remaining},
        )

    db.commit()

    return {
        "loan_id": loan.id,
        "amount_paid": payment,
        "amount_remaining": round(new_remaining, 2),
        "status": loan.status,
        "new_balance": borrower_wallet.balance_total,
    }


@router.get("/me", response_model=loan_schemas.LoanListResponse)
def get_my_loans(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all loans where user is borrower or lender."""
    as_borrower = db.query(models.Loan).filter(models.Loan.borrower_id == user_id).all()
    as_lender = db.query(models.Loan).filter(models.Loan.lender_id == user_id).all()

    return {
        "loans_as_borrower": [_loan_to_response(l, db) for l in as_borrower],
        "loans_as_lender": [_loan_to_response(l, db) for l in as_lender],
    }
