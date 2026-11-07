export function extractFile(input) {
  // could be a File:
  if (input instanceof File) return input;
  // could be your ImageUpload’s { file, preview }
  if (input && input.file instanceof File) return input.file;
  // otherwise no new file to upload
  return null;
}
