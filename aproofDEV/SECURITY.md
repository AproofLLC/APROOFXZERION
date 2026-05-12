# Security

## Reporting vulnerabilities

If you believe you have found a security vulnerability, please report it responsibly (private channel to maintainers or GitHub Security Advisories if enabled). Do **not** file public issues with exploit details until the report has been triaged.

## Secrets and devnet hygiene

- **Never** commit `.env`, real API keys, mnemonics, PEM files, or Solana keypair JSON intended for spending.
- **Never** reuse production or mainnet private keys for this demo. The stack targets **Solana devnet** only.
- **Local keypairs** are generated under `APROOF/.local/` (gitignored). Treat them as disposable devnet keys.

## Devnet-only demo

This repository is meant for hackathon and review demos on devnet. Do not point production wallets or secrets at it.
