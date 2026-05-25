import { getConvexSiteBaseUrl } from "@/lib/invoice-pdf-url";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const invoiceId = requestUrl.searchParams.get("invoiceId");
  const token = requestUrl.searchParams.get("token");

  if (!invoiceId || !token) {
    return new Response("Missing invoiceId or token", { status: 400 });
  }

  const convexBaseUrl = getConvexSiteBaseUrl();
  if (!convexBaseUrl) {
    return new Response("Invoice PDF service unavailable", { status: 503 });
  }

  const upstreamUrl = new URL("/invoice-pdf", convexBaseUrl);
  upstreamUrl.searchParams.set("invoiceId", invoiceId);
  upstreamUrl.searchParams.set("token", token);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl.toString(), {
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    return new Response("Invoice PDF service unavailable", { status: 503 });
  }

  if (!upstreamResponse.ok) {
    return new Response(await upstreamResponse.text(), {
      status: upstreamResponse.status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }

  const responseHeaders = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  const contentDisposition = upstreamResponse.headers.get("content-disposition");
  const cacheControl = upstreamResponse.headers.get("cache-control");

  if (contentType) {
    responseHeaders.set("Content-Type", contentType);
  }
  if (contentDisposition) {
    responseHeaders.set("Content-Disposition", contentDisposition);
  }
  responseHeaders.set(
    "Cache-Control",
    cacheControl || "private, no-store, max-age=0",
  );

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}
