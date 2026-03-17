import { NextRequest, NextResponse } from "next/server";

function getExtensionFromContentType(contentType: string) {
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "";
}

function ensureFileName(fileName: string, contentType: string) {
  const trimmed = fileName.trim() || "file";

  if (trimmed.includes(".")) {
    return trimmed;
  }

  const extension = getExtensionFromContentType(contentType);

  if (!extension) {
    return trimmed;
  }

  return `${trimmed}.${extension}`;
}

function getFileNameFromUrl(url: string, contentType: string) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const lastSegment = pathname.split("/").filter(Boolean).pop() || "file";
    const decoded = decodeURIComponent(lastSegment);

    return ensureFileName(decoded, contentType);
  } catch {
    return ensureFileName("file", contentType);
  }
}

export async function GET(request: NextRequest) {
  const fileUrl = request.nextUrl.searchParams.get("url");
  const fileNameParam = request.nextUrl.searchParams.get("filename");

  if (!fileUrl) {
    return NextResponse.json({ error: "Missing file url" }, { status: 400 });
  }

  try {
    const remoteResponse = await fetch(fileUrl, {
      cache: "no-store",
    });

    if (!remoteResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch remote file" },
        { status: 502 }
      );
    }

    const contentType =
      remoteResponse.headers.get("content-type") || "application/octet-stream";

    const arrayBuffer = await remoteResponse.arrayBuffer();

    const fileName = fileNameParam?.trim()
      ? ensureFileName(fileNameParam, contentType)
      : getFileNameFromUrl(fileUrl, contentType);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Download proxy error:", error);

    return NextResponse.json(
      { error: "Unable to download file" },
      { status: 500 }
    );
  }
}