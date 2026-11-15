"""create customer and payment table update sale table

Revision ID: b3415d447aaa
Revises: da1e24f6370b
Create Date: 2026-10-30 23:53:07.572207

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b3415d447aaa'
down_revision: Union[str, Sequence[str], None] = 'da1e24f6370b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1) create the enum type FIRST: op.add_column never creates it by itself
    op.execute("CREATE TYPE payment_status AS ENUM ('PAID', 'PARTIAL', 'UNPAID')")

    # 2) gen_random_uuid() for the seed rows (built in on PostgreSQL 13+, harmless otherwise)
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # 3) new tables
    op.create_table('customers',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('phone', sa.String(length=30), nullable=True),
    sa.Column('credit_limit', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('phone')
    )
    op.create_index(op.f('ix_customers_name'), 'customers', ['name'], unique=False)

    op.create_table('payment_methods',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('type', sa.String(length=20), nullable=False),
    sa.Column('account_number', sa.String(length=60), nullable=True),
    sa.Column('account_name', sa.String(length=120), nullable=True),
    sa.Column('requires_reference', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payment_methods_code'), 'payment_methods', ['code'], unique=True)

    op.create_table('payments',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('sale_id', sa.Uuid(), nullable=False),
    sa.Column('payment_method_id', sa.Uuid(), nullable=True),
    sa.Column('method', sa.String(length=20), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('reference', sa.String(length=100), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('received_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount <> 0', name='ck_payment_nonzero'),
    sa.ForeignKeyConstraint(['payment_method_id'], ['payment_methods.id'], ),
    sa.ForeignKeyConstraint(['received_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payments_method'), 'payments', ['method'], unique=False)
    op.create_index(op.f('ix_payments_payment_method_id'), 'payments', ['payment_method_id'], unique=False)
    op.create_index(op.f('ix_payments_sale_id'), 'payments', ['sale_id'], unique=False)

    # 4) new columns on sales
    op.add_column('sales', sa.Column('customer_id', sa.Uuid(), nullable=True))
    op.add_column('sales', sa.Column(
        'payment_status',
        postgresql.ENUM('PAID', 'PARTIAL', 'UNPAID', name='payment_status', create_type=False),
        server_default='PAID',
        nullable=False,
    ))
    op.add_column('sales', sa.Column('amount_paid', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False))
    op.add_column('sales', sa.Column('balance_due', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False))
    op.add_column('sales', sa.Column('due_date', sa.Date(), nullable=True))
    op.create_index(op.f('ix_sales_customer_id'), 'sales', ['customer_id'], unique=False)
    op.create_index(op.f('ix_sales_payment_status'), 'sales', ['payment_status'], unique=False)
    op.create_foreign_key('fk_sales_customer_id', 'sales', 'customers', ['customer_id'], ['id'])
    op.create_check_constraint('ck_sale_balance_non_negative', 'sales', 'balance_due >= 0')

    # NOTE: op.drop_column('sales', 'customer_name') was REMOVED on purpose (no data loss).
    # If it is only test data and you want it gone, add it back here.

    # 5) seed the payment methods
    op.execute("""
        INSERT INTO payment_methods (id, code, name, type, requires_reference, is_active, sort_order)
        VALUES
          (gen_random_uuid(), 'cash',     'Cash',     'cash',         false, true, 1),
          (gen_random_uuid(), 'telebirr', 'Telebirr', 'mobile_money', true,  true, 2),
          (gen_random_uuid(), 'cbe',      'CBE',      'bank',         true,  true, 3),
          (gen_random_uuid(), 'dashen',   'Dashen',   'bank',         true,  true, 4),
          (gen_random_uuid(), 'boa',      'BOA',      'bank',         true,  true, 5),
          (gen_random_uuid(), 'awash',    'Awash',    'bank',         true,  true, 6)
    """)

    # 6) old sales count as fully paid
    op.execute("UPDATE sales SET amount_paid = total, balance_due = 0, payment_status = 'PAID'")

    # 7) OPTIONAL: one cash payment row per old completed sale so the daily payment
    #    report includes them. Delete this block if the old sales were only tests.
    op.execute("""
        INSERT INTO payments (id, sale_id, payment_method_id, method, amount, received_by, created_at)
        SELECT gen_random_uuid(), s.id,
               (SELECT id FROM payment_methods WHERE code = 'cash'),
               'cash', s.total, s.created_by, s.created_at
        FROM sales s
        WHERE s.status = 'COMPLETED' AND s.total > 0
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_sale_balance_non_negative', 'sales', type_='check')
    op.drop_constraint('fk_sales_customer_id', 'sales', type_='foreignkey')
    op.drop_index(op.f('ix_sales_payment_status'), table_name='sales')
    op.drop_index(op.f('ix_sales_customer_id'), table_name='sales')
    op.drop_column('sales', 'due_date')
    op.drop_column('sales', 'balance_due')
    op.drop_column('sales', 'amount_paid')
    op.drop_column('sales', 'payment_status')
    op.drop_column('sales', 'customer_id')

    op.drop_index(op.f('ix_payments_sale_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_payment_method_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_method'), table_name='payments')
    op.drop_table('payments')
    op.drop_index(op.f('ix_payment_methods_code'), table_name='payment_methods')
    op.drop_table('payment_methods')
    op.drop_index(op.f('ix_customers_name'), table_name='customers')
    op.drop_table('customers')

    op.execute("DROP TYPE IF EXISTS payment_status")