-- ============================================================
-- CiNect Cinema Platform – PostgreSQL Schema V1
-- Compatible with Supabase PostgreSQL
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('ADMIN', 'STAFF', 'USER');
CREATE TYPE movie_status AS ENUM ('NOW_SHOWING', 'COMING_SOON', 'ENDED');
CREATE TYPE age_rating AS ENUM ('P', 'C13', 'C16', 'C18');
CREATE TYPE room_format AS ENUM ('2D', '3D', 'IMAX', '4DX', 'DOLBY');
CREATE TYPE seat_type AS ENUM ('STANDARD', 'VIP', 'COUPLE', 'DISABLED');
CREATE TYPE seat_status AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE payment_method AS ENUM ('CARD', 'MOMO', 'ZALOPAY', 'VNPAY', 'BANK_TRANSFER', 'CASH');
CREATE TYPE discount_type AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE promotion_status AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');
CREATE TYPE day_type AS ENUM ('WEEKDAY', 'WEEKEND', 'HOLIDAY');
CREATE TYPE time_slot AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'NIGHT');
CREATE TYPE notification_type AS ENUM ('BOOKING', 'PROMOTION', 'SYSTEM', 'MEMBERSHIP');
CREATE TYPE gift_card_status AS ENUM ('AVAILABLE', 'SOLD_OUT', 'REDEEMED', 'EXPIRED');
CREATE TYPE coupon_status AS ENUM ('ACTIVE', 'USED', 'EXPIRED');
CREATE TYPE news_category AS ENUM ('REVIEWS', 'TRAILERS', 'PROMOTIONS', 'GUIDES', 'GENERAL');
CREATE TYPE hold_status AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONVERTED');
CREATE TYPE points_tx_type AS ENUM ('EARNED', 'SPENT', 'EXPIRED', 'ADJUSTED');
CREATE TYPE support_category AS ENUM ('BOOKING', 'PAYMENT', 'ACCOUNT', 'TECHNICAL', 'OTHER');

-- ============================================================
-- 1. USERS & ROLES
-- ============================================================

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        user_role NOT NULL UNIQUE,
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email            VARCHAR(255) NOT NULL UNIQUE,
    password_hash    VARCHAR(255) NOT NULL,
    full_name        VARCHAR(255) NOT NULL,
    phone            VARCHAR(20),
    avatar           TEXT,
    date_of_birth    DATE,
    gender           VARCHAR(10),
    city             VARCHAR(100),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    refresh_token    TEXT,
    reset_token      TEXT,
    reset_token_exp  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_city ON users(city);

-- ============================================================
-- 2. GENRES & MOVIES
-- ============================================================

CREATE TABLE genres (
    id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE movies (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title          VARCHAR(500) NOT NULL,
    original_title VARCHAR(500),
    slug           VARCHAR(500) NOT NULL UNIQUE,
    description    TEXT NOT NULL,
    poster_url     TEXT NOT NULL,
    banner_url     TEXT,
    trailer_url    TEXT,
    gallery_urls   JSONB DEFAULT '[]'::jsonb,
    duration       INT NOT NULL CHECK (duration > 0),
    release_date   DATE NOT NULL,
    end_date       DATE,
    director       VARCHAR(255) NOT NULL,
    cast_members   JSONB DEFAULT '[]'::jsonb,
    language       VARCHAR(50) NOT NULL DEFAULT 'Vietnamese',
    subtitles      VARCHAR(100),
    rating         NUMERIC(3,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 10),
    rating_count   INT DEFAULT 0,
    age_rating     age_rating NOT NULL DEFAULT 'P',
    formats        JSONB DEFAULT '["2D"]'::jsonb,
    status         movie_status NOT NULL DEFAULT 'COMING_SOON',
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE movie_genres (
    movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (movie_id, genre_id)
);

CREATE INDEX idx_movies_status ON movies(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_movies_slug ON movies(slug);
CREATE INDEX idx_movies_release ON movies(release_date);

-- ============================================================
-- 3. CINEMAS, ROOMS, SEATS
-- ============================================================

CREATE TABLE cinemas (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(255) NOT NULL,
    slug       VARCHAR(255) NOT NULL UNIQUE,
    address    TEXT NOT NULL,
    city       VARCHAR(100) NOT NULL,
    district   VARCHAR(100),
    phone      VARCHAR(20),
    email      VARCHAR(255),
    image_url  TEXT,
    amenities  JSONB DEFAULT '[]'::jsonb,
    latitude   DOUBLE PRECISION,
    longitude  DOUBLE PRECISION,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rooms (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cinema_id   UUID NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    format      room_format NOT NULL DEFAULT '2D',
    total_seats INT NOT NULL DEFAULT 0,
    rows        INT NOT NULL DEFAULT 0,
    columns     INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cinema_id, name)
);

CREATE TABLE seats (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id   UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    row_label VARCHAR(5) NOT NULL,
    number    INT NOT NULL CHECK (number > 0),
    type      seat_type NOT NULL DEFAULT 'STANDARD',
    status    seat_status NOT NULL DEFAULT 'AVAILABLE',
    pair_id   UUID REFERENCES seats(id),
    is_aisle  BOOLEAN NOT NULL DEFAULT FALSE,
    price     NUMERIC(12,2),
    UNIQUE(room_id, row_label, number)
);

CREATE INDEX idx_cinemas_city ON cinemas(city) WHERE is_active = TRUE;
CREATE INDEX idx_rooms_cinema ON rooms(cinema_id) WHERE is_active = TRUE;
CREATE INDEX idx_seats_room ON seats(room_id);

-- ============================================================
-- 4. SHOWTIMES
-- ============================================================

CREATE TABLE showtimes (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movie_id         UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    room_id          UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    cinema_id        UUID NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
    start_time       TIMESTAMPTZ NOT NULL,
    end_time         TIMESTAMPTZ NOT NULL,
    base_price       NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
    format           room_format NOT NULL DEFAULT '2D',
    language         VARCHAR(50),
    subtitles        VARCHAR(100),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    member_exclusive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX idx_showtimes_movie ON showtimes(movie_id) WHERE is_active = TRUE;
CREATE INDEX idx_showtimes_cinema ON showtimes(cinema_id) WHERE is_active = TRUE;
CREATE INDEX idx_showtimes_room ON showtimes(room_id);
CREATE INDEX idx_showtimes_time ON showtimes(start_time, end_time) WHERE is_active = TRUE;
CREATE INDEX idx_showtimes_date ON showtimes(cinema_id, (start_time::date)) WHERE is_active = TRUE;

-- ============================================================
-- 5. HOLDS (Seat reservation with TTL)
-- ============================================================

CREATE TABLE holds (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    showtime_id  UUID NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
    seat_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    status       hold_status NOT NULL DEFAULT 'ACTIVE',
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent same seat being held twice for same showtime
CREATE TABLE hold_seats (
    hold_id     UUID NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
    showtime_id UUID NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
    seat_id     UUID NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
    PRIMARY KEY (hold_id, seat_id)
);

-- Partial unique: only one active hold per seat per showtime
CREATE UNIQUE INDEX idx_hold_seats_unique_active
    ON hold_seats(showtime_id, seat_id);
-- We enforce this at application level + clean expired holds via scheduler

CREATE INDEX idx_holds_user ON holds(user_id);
CREATE INDEX idx_holds_showtime ON holds(showtime_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_holds_expires ON holds(expires_at) WHERE status = 'ACTIVE';

-- ============================================================
-- 6. BOOKINGS & ITEMS
-- ============================================================

CREATE TABLE bookings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    showtime_id     UUID NOT NULL REFERENCES showtimes(id),
    hold_id         UUID REFERENCES holds(id),
    total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    final_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          booking_status NOT NULL DEFAULT 'PENDING',
    promotion_code  VARCHAR(100),
    points_used     INT DEFAULT 0,
    gift_card_code  VARCHAR(100),
    qr_code         TEXT,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_items (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id     UUID NOT NULL REFERENCES seats(id),
    showtime_id UUID NOT NULL REFERENCES showtimes(id),
    row_label   VARCHAR(5) NOT NULL,
    seat_number INT NOT NULL,
    seat_type   seat_type NOT NULL,
    price       NUMERIC(12,2) NOT NULL
);

-- Prevent double-booking: one seat per showtime across non-cancelled bookings
CREATE UNIQUE INDEX idx_booking_items_unique_seat
    ON booking_items(showtime_id, seat_id)
    WHERE EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.id = booking_id AND b.status NOT IN ('CANCELLED')
    );
-- Note: Supabase may not support WHERE with subquery in partial index.
-- Alternative: enforce at application level with SELECT FOR UPDATE.

CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_showtime ON bookings(showtime_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_booking_items_booking ON booking_items(booking_id);
CREATE INDEX idx_booking_items_seat ON booking_items(showtime_id, seat_id);

-- ============================================================
-- 7. SNACKS
-- ============================================================

CREATE TABLE snacks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cinema_id   UUID REFERENCES cinemas(id) ON DELETE SET NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    image_url   TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_snacks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    snack_id    UUID NOT NULL REFERENCES snacks(id),
    name        VARCHAR(255) NOT NULL,
    quantity    INT NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(12,2) NOT NULL,
    total_price NUMERIC(12,2) NOT NULL
);

CREATE INDEX idx_snacks_cinema ON snacks(cinema_id) WHERE is_active = TRUE;

-- ============================================================
-- 8. PAYMENTS
-- ============================================================

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    method          payment_method NOT NULL,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    status          payment_status NOT NULL DEFAULT 'PENDING',
    transaction_id  VARCHAR(255),
    payment_url     TEXT,
    error_reason    TEXT,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_tx ON payments(transaction_id) WHERE transaction_id IS NOT NULL;

-- ============================================================
-- 9. PRICING RULES
-- ============================================================

CREATE TABLE pricing_rules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255),
    cinema_id   UUID REFERENCES cinemas(id) ON DELETE SET NULL,
    seat_type   seat_type,
    format      room_format,
    day_type    day_type,
    time_slot   time_slot,
    is_holiday  BOOLEAN DEFAULT FALSE,
    price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pricing_rules_active ON pricing_rules(is_active) WHERE is_active = TRUE;

-- ============================================================
-- 10. PROMOTIONS & COUPONS
-- ============================================================

CREATE TABLE promotions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title          VARCHAR(500) NOT NULL,
    description    TEXT,
    code           VARCHAR(100) UNIQUE,
    discount_type  discount_type NOT NULL,
    discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
    min_purchase   NUMERIC(12,2),
    max_discount   NUMERIC(12,2),
    usage_limit    INT,
    usage_count    INT DEFAULT 0,
    start_date     TIMESTAMPTZ NOT NULL,
    end_date       TIMESTAMPTZ NOT NULL,
    image_url      TEXT,
    conditions     TEXT,
    status         promotion_status NOT NULL DEFAULT 'ACTIVE',
    is_trending    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date > start_date)
);

CREATE TABLE coupons (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    promotion_id   UUID REFERENCES promotions(id) ON DELETE SET NULL,
    code           VARCHAR(100) NOT NULL UNIQUE,
    discount_type  discount_type NOT NULL,
    discount_value NUMERIC(12,2) NOT NULL,
    min_purchase   NUMERIC(12,2),
    max_discount   NUMERIC(12,2),
    status         coupon_status NOT NULL DEFAULT 'ACTIVE',
    expires_at     TIMESTAMPTZ NOT NULL,
    used_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_promotions_status ON promotions(status);
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date) WHERE status = 'ACTIVE';
CREATE INDEX idx_coupons_user ON coupons(user_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_coupons_code ON coupons(code);

-- ============================================================
-- 11. MEMBERSHIP & POINTS
-- ============================================================

CREATE TABLE membership_tiers (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(100) NOT NULL UNIQUE,
    level            INT NOT NULL UNIQUE,
    points_required  INT NOT NULL DEFAULT 0,
    benefits         JSONB DEFAULT '[]'::jsonb,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    color            VARCHAR(50) DEFAULT '#6B7280',
    icon             VARCHAR(100),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE memberships (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tier_id        UUID NOT NULL REFERENCES membership_tiers(id),
    current_points INT NOT NULL DEFAULT 0,
    total_points   INT NOT NULL DEFAULT 0,
    member_since   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE points_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        points_tx_type NOT NULL,
    points      INT NOT NULL,
    balance     INT NOT NULL DEFAULT 0,
    description VARCHAR(500),
    booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_points_history_user ON points_history(user_id);

-- ============================================================
-- 12. GIFT CARDS
-- ============================================================

CREATE TABLE gift_cards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    image_url       TEXT,
    value           NUMERIC(12,2) NOT NULL CHECK (value > 0),
    price           NUMERIC(12,2) NOT NULL CHECK (price > 0),
    code            VARCHAR(100) UNIQUE,
    status          gift_card_status NOT NULL DEFAULT 'AVAILABLE',
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gift_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gift_card_id    UUID NOT NULL REFERENCES gift_cards(id),
    buyer_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_email VARCHAR(255),
    message         TEXT,
    purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redeemed_at     TIMESTAMPTZ,
    redeemed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL
);

CREATE INDEX idx_gift_cards_status ON gift_cards(status);
CREATE INDEX idx_gift_tx_buyer ON gift_transactions(buyer_id);

-- ============================================================
-- 13. REVIEWS
-- ============================================================

CREATE TABLE reviews (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movie_id   UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    rating     INT NOT NULL CHECK (rating >= 1 AND rating <= 10),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, movie_id)
);

CREATE INDEX idx_reviews_movie ON reviews(movie_id);

-- ============================================================
-- 14. NEWS ARTICLES
-- ============================================================

CREATE TABLE news_articles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title               VARCHAR(500) NOT NULL,
    slug                VARCHAR(500) NOT NULL UNIQUE,
    excerpt             TEXT NOT NULL,
    content             TEXT NOT NULL,
    category            news_category NOT NULL DEFAULT 'GENERAL',
    image_url           TEXT,
    author              VARCHAR(255) NOT NULL,
    tags                JSONB DEFAULT '[]'::jsonb,
    related_article_ids JSONB DEFAULT '[]'::jsonb,
    published_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_news_slug ON news_articles(slug);
CREATE INDEX idx_news_category ON news_articles(category);

-- ============================================================
-- 15. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(500) NOT NULL,
    message    TEXT NOT NULL,
    type       notification_type NOT NULL DEFAULT 'SYSTEM',
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    link       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- 16. AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email  VARCHAR(255),
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id   VARCHAR(255),
    old_values  JSONB,
    new_values  JSONB,
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- ============================================================
-- 17. CAMPAIGNS & BANNERS
-- ============================================================

CREATE TABLE campaigns (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       VARCHAR(500) NOT NULL,
    slug        VARCHAR(500) NOT NULL UNIQUE,
    description TEXT,
    content     TEXT,
    image_url   TEXT,
    start_date  TIMESTAMPTZ NOT NULL,
    end_date    TIMESTAMPTZ NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE banners (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       VARCHAR(500),
    image_url   TEXT NOT NULL,
    link_url    TEXT,
    position    VARCHAR(50) NOT NULL DEFAULT 'home',
    sort_order  INT DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    start_date  TIMESTAMPTZ,
    end_date    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_banners_position ON banners(position) WHERE is_active = TRUE;

-- ============================================================
-- 18. SUPPORT TICKETS
-- ============================================================

CREATE TABLE support_tickets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    subject     VARCHAR(500) NOT NULL,
    category    support_category DEFAULT 'OTHER',
    message     TEXT NOT NULL,
    booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SEED: Default roles and membership tiers
-- ============================================================

INSERT INTO roles (name) VALUES ('ADMIN'), ('STAFF'), ('USER');

INSERT INTO membership_tiers (name, level, points_required, benefits, discount_percent, color) VALUES
('Bronze', 1, 0, '["Welcome bonus 50 points","Birthday voucher"]'::jsonb, 0, '#CD7F32'),
('Silver', 2, 1000, '["5% discount on tickets","Free size upgrade on combo","Birthday voucher"]'::jsonb, 5, '#C0C0C0'),
('Gold', 3, 5000, '["10% discount on tickets","Priority booking","Free combo monthly","Birthday voucher"]'::jsonb, 10, '#FFD700'),
('Platinum', 4, 15000, '["15% discount on tickets","VIP lounge access","Free combo weekly","Birthday voucher","Exclusive screenings"]'::jsonb, 15, '#E5E4E2');

-- ============================================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema = 'public'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            t, t
        );
    END LOOP;
END;
$$;
