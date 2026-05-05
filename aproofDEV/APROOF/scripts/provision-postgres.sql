-- Run once as a Postgres superuser (e.g. psql -U postgres -f scripts/provision-postgres.sql)
-- Then use: DATABASE_URL=postgresql://aproof:aproof_dev_change_me@localhost:5432/aproof

CREATE USER aproof WITH PASSWORD 'aproof_dev_change_me';
CREATE DATABASE aproof OWNER aproof;
GRANT ALL PRIVILEGES ON DATABASE aproof TO aproof;
