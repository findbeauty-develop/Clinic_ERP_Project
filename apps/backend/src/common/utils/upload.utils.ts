import { parse, join } from "path";
import { v4 as uuidv4 } from "uuid";
import { promises as fs } from "fs";

export const validMimeTypes = ["image/png", "image/jpg", "image/jpeg"];

export const getSerialForImage = (filename: string) => {
  const ext = parse(filename).ext || ".png";
  return `${uuidv4()}${ext}`;
};

export const getUploadCategory = (category: string) => {
  const normalized = category?.toLowerCase();
  if (["clinic", "member", "product"].includes(normalized)) {
    return normalized;
  }
  return "misc";
};

const UPLOAD_ROOT = join(process.cwd(), "uploads");

const dataUrlRegex = /^data:(?<mime>[^;]+);base64,(?<data>.+)$/;

const getExtensionFromMime = (mime: string) => {
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  return parse(`.${mime.split("/").pop() ?? "png"}`).ext || ".png";
};

export const saveBase64Images = async (
  category: string,
  images: string[]
): Promise<string[]> => {
  if (!images?.length) return [];

  const normalizedCategory = getUploadCategory(category);
  const categoryDir = join(UPLOAD_ROOT, normalizedCategory);
  await fs.mkdir(categoryDir, { recursive: true });

  const results: string[] = [];

  for (const image of images) {
    if (!image) continue;
    const match = image.match(dataUrlRegex);
    if (!match?.groups) {
      results.push(image);
      continue;
    }

    const mime = match.groups["mime"];
    const base64Data = match.groups["data"];
    if (!validMimeTypes.includes(mime)) {
      results.push(image);
      continue;
    }

    const buffer = Buffer.from(base64Data, "base64");
    const filename =
      uuidv4() + getExtensionFromMime(mime ?? "image/png");
    const filePath = join(categoryDir, filename);
    await fs.writeFile(filePath, buffer);
    results.push(`/uploads/${normalizedCategory}/${filename}`);
  }

  return results;
};

