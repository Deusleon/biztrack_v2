// src/utils/cloudinary.js

// Read Cloudinary settings from environment variables
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * Upload a File to Cloudinary and return the secure URL and public_id.
 * @param {File} file - the File object (e.g. from input or drag&drop)
 * @returns {Promise<{ url: string, public_id: string }>}
 */
export async function uploadImageToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
  const formData = new FormData();
  formData.append("file", file.file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Cloudinary error payload:", data);
    throw new Error(data.error?.message || "Cloudinary upload failed");
  }

  return { url: data.secure_url, public_id: data.public_id };
}
