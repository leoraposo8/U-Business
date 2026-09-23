-- Usuarios da empresa que recebem copia por e-mail de todo voucher emitido.
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS recebe_vouchers boolean NOT NULL DEFAULT false;
