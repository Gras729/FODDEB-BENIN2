-- ============================================================
-- FODDEB — Schéma PostgreSQL v1.0
-- Migration 001 : tables, types, RLS, triggers, indexes
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TYPES ÉNUMÉRÉS
-- ============================================================

CREATE TYPE role_membre    AS ENUM ('member', 'admin', 'manager');
CREATE TYPE statut_membre  AS ENUM ('actif', 'inactif', 'suspendu', 'en_attente');
CREATE TYPE statut_don     AS ENUM ('pending', 'approved', 'declined', 'cancelled');
CREATE TYPE mode_don       AS ENUM ('mobile_money', 'carte', 'virement', 'especes');
CREATE TYPE type_don       AS ENUM ('don_libre', 'cotisation', 'adhesion');
CREATE TYPE statut_projet  AS ENUM ('brouillon', 'en_cours', 'termine', 'suspendu', 'annule');
CREATE TYPE statut_activite AS ENUM ('planifiee', 'en_cours', 'terminee', 'annulee');
CREATE TYPE statut_actu    AS ENUM ('brouillon', 'publie', 'archive');
CREATE TYPE statut_nl      AS ENUM ('active', 'unsubscribed');
CREATE TYPE statut_contact AS ENUM ('nouveau', 'lu', 'traite', 'archive');
CREATE TYPE statut_bailleur AS ENUM ('actif', 'inactif', 'prospect');
CREATE TYPE statut_rapport AS ENUM ('brouillon', 'soumis', 'valide', 'rejete');
CREATE TYPE type_bailleur  AS ENUM ('Institution', 'ONG', 'Gouvernement', 'Entreprise', 'Individu');

-- ============================================================
-- TABLE : membres
-- ============================================================

CREATE TABLE membres (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom          TEXT NOT NULL,
  nom             TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  telephone       TEXT UNIQUE,
  organisation    TEXT,
  departement     TEXT,
  role            role_membre    NOT NULL DEFAULT 'member',
  statut          statut_membre  NOT NULL DEFAULT 'en_attente',
  domaine         TEXT,
  password_hash   TEXT,                        -- bcrypt stocké côté API
  num_cni         TEXT UNIQUE,
  newsletter      BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  photo_url       TEXT,                        -- Supabase Storage
  cni_url         TEXT,
  recepisse_url   TEXT,
  signature_url   TEXT,
  date_adhesion   DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_membres_email   ON membres (email);
CREATE INDEX idx_membres_role    ON membres (role);
CREATE INDEX idx_membres_statut  ON membres (statut);

-- ============================================================
-- TABLE : dons
-- ============================================================

CREATE TABLE dons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           TEXT NOT NULL UNIQUE,          -- ex. DON-1718000000000
  prenom        TEXT NOT NULL,
  nom           TEXT NOT NULL,
  email         TEXT NOT NULL,
  montant       NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  type_don      type_don   NOT NULL DEFAULT 'don_libre',
  statut        statut_don NOT NULL DEFAULT 'pending',
  mode          mode_don,
  fedapay_ref   TEXT,                          -- ID transaction FedaPay
  date_don      DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dons_email   ON dons (email);
CREATE INDEX idx_dons_statut  ON dons (statut);
CREATE INDEX idx_dons_ref     ON dons (ref);

-- ============================================================
-- TABLE : projets
-- ============================================================

CREATE TABLE projets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id       UUID REFERENCES membres(id) ON DELETE SET NULL,
  titre           TEXT NOT NULL,
  description     TEXT,                        -- contenu long (remplace Google Docs)
  departement     TEXT,
  budget          NUMERIC(14,2) DEFAULT 0,
  depense         NUMERIC(14,2) DEFAULT 0,
  beneficiaires   TEXT,
  date_debut      DATE,
  date_fin        DATE,
  image_url       TEXT,                        -- Supabase Storage
  fichier_url     TEXT,
  fichier_nom     TEXT,
  responsable     TEXT,
  statut          statut_projet NOT NULL DEFAULT 'brouillon',
  progression     SMALLINT DEFAULT 0 CHECK (progression BETWEEN 0 AND 100),
  domaine         TEXT,
  partenaires     TEXT,
  objectifs       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projets_statut     ON projets (statut);
CREATE INDEX idx_projets_membre_id  ON projets (membre_id);
CREATE INDEX idx_projets_titre      ON projets USING gin (titre gin_trgm_ops);

-- ============================================================
-- TABLE : activites
-- ============================================================

CREATE TABLE activites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id   UUID NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  titre       TEXT NOT NULL,
  description TEXT,
  date        DATE,
  statut      statut_activite NOT NULL DEFAULT 'planifiee',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activites_projet_id ON activites (projet_id);

-- ============================================================
-- TABLE : actualites
-- ============================================================

CREATE TABLE actualites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre            TEXT NOT NULL,
  categorie        TEXT,
  excerpt          TEXT,
  contenu          TEXT,                       -- contenu long (remplace Google Docs)
  auteur           TEXT,
  date_publication DATE,
  statut           statut_actu NOT NULL DEFAULT 'brouillon',
  tags             TEXT[],                     -- tableau PostgreSQL natif
  image_url        TEXT,                       -- Supabase Storage
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_actualites_statut ON actualites (statut);
CREATE INDEX idx_actualites_titre  ON actualites USING gin (titre gin_trgm_ops);
CREATE INDEX idx_actualites_tags   ON actualites USING gin (tags);

-- ============================================================
-- TABLE : newsletter
-- ============================================================

CREATE TABLE newsletter (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  nom              TEXT,
  source           TEXT DEFAULT 'Manuel',
  statut           statut_nl NOT NULL DEFAULT 'active',
  date_inscription DATE DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_newsletter_email  ON newsletter (email);
CREATE INDEX idx_newsletter_statut ON newsletter (statut);

-- ============================================================
-- TABLE : contacts
-- ============================================================

CREATE TABLE contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom       TEXT NOT NULL,
  nom          TEXT NOT NULL,
  email        TEXT NOT NULL,
  telephone    TEXT,
  organisation TEXT,
  sujet        TEXT,
  message      TEXT NOT NULL,
  newsletter   BOOLEAN DEFAULT FALSE,
  statut       statut_contact NOT NULL DEFAULT 'nouveau',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_email  ON contacts (email);
CREATE INDEX idx_contacts_statut ON contacts (statut);

-- ============================================================
-- TABLE : bailleurs
-- ============================================================

CREATE TABLE bailleurs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  type        type_bailleur NOT NULL DEFAULT 'Institution',
  pays        TEXT,
  montant     NUMERIC(14,2) DEFAULT 0,
  decaisse    NUMERIC(14,2) DEFAULT 0,
  projets     TEXT,                           -- liste projet IDs ou noms (texte libre)
  contact     TEXT,
  email       TEXT,
  date_debut  DATE,
  date_fin    DATE,
  statut      statut_bailleur NOT NULL DEFAULT 'actif',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bailleurs_statut ON bailleurs (statut);

-- ============================================================
-- TABLE : rapports
-- ============================================================

CREATE TABLE rapports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  type        TEXT,
  bailleur    TEXT,
  projet      TEXT,
  periode     TEXT,
  taille      BIGINT,                         -- taille fichier en octets
  statut      statut_rapport NOT NULL DEFAULT 'brouillon',
  url         TEXT,                           -- Supabase Storage
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE : sessions
-- Gestion des tokens JWT custom (complément à Supabase Auth)
-- Supabase Auth gère les sessions principales ;
-- cette table stocke les tokens OTP/sessions admin maison si nécessaire.
-- ============================================================

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id   UUID NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  user_agent  TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_token     ON sessions (token);
CREATE INDEX idx_sessions_membre_id ON sessions (membre_id);
CREATE INDEX idx_sessions_expires   ON sessions (expires_at);

-- ============================================================
-- TABLE : otp
-- ============================================================

CREATE TABLE otp (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id   UUID REFERENCES membres(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    SMALLINT DEFAULT 0,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_otp_email      ON otp (email);
CREATE INDEX idx_otp_expires_at ON otp (expires_at);

-- ============================================================
-- TABLE : logs
-- ============================================================

CREATE TABLE logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action     TEXT NOT NULL,
  membre_id  UUID REFERENCES membres(id) ON DELETE SET NULL,
  data       JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_action    ON logs (action);
CREATE INDEX idx_logs_membre_id ON logs (membre_id);
CREATE INDEX idx_logs_created   ON logs (created_at DESC);

-- ============================================================
-- TABLE : parametres
-- Remplace PropertiesService de GAS
-- ============================================================

CREATE TABLE parametres (
  cle         TEXT PRIMARY KEY,
  valeur      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Valeurs initiales
INSERT INTO parametres (cle, valeur) VALUES
  ('SITE_NAME',               'FODDEB'),
  ('SITE_URL',                'https://foddeb.vercel.app'),
  ('ADMIN_EMAIL',             'phanoskosmos@gmail.com'),
  ('SITE_TEL',                ''),
  ('SITE_ADRESSE',            ''),
  ('COTISATION_ANNUELLE',     '5000'),
  ('COTISATION_INSCRIPTION',  '2000');

-- ============================================================
-- TRIGGER : updated_at automatique
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_membres_updated_at
  BEFORE UPDATE ON membres
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projets_updated_at
  BEFORE UPDATE ON projets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_actualites_updated_at
  BEFORE UPDATE ON actualites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bailleurs_updated_at
  BEFORE UPDATE ON bailleurs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_parametres_updated_at
  BEFORE UPDATE ON parametres
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Toutes les tables sont verrouillées par défaut.
-- L'accès passe exclusivement par les API routes Vercel
-- qui utilisent la clé service_role côté serveur.
-- ============================================================

ALTER TABLE membres    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE projets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE activites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE actualites ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bailleurs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp        ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres ENABLE ROW LEVEL SECURITY;

-- Aucune policy anon — tout passe par service_role (backend uniquement)
-- La clé anon côté client n'a aucun accès aux données.
