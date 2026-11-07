-- Add image_public_id column to products table for Cloudinary asset management
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS image_public_id TEXT;
