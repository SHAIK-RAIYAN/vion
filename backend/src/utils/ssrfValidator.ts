import dns from "dns/promises";
import net from "net";
import { AppError } from "./AppError";

/**
 * List of explicitly approved domains for remote video ingestion.
 * Prevents arbitrary internal network probing and SSRF attacks.
 */
const APPROVED_VIDEO_DOMAINS = [
  "supabase.co",
  "r2.cloudflarestorage.com",
  "storage.googleapis.com",
  "amazonaws.com",
  "vion.tv",
  "commondatastorage.googleapis.com",
  "cdn.jsdelivr.net",
  "raw.githubusercontent.com",
  "test-videos.co.uk",
];

/**
 * Checks whether an IPv4 address belongs to private, loopback, or link-local ranges.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p === undefined)) return true;

  const b0 = parts[0] as number;
  const b1 = parts[1] as number;

  // 127.0.0.0/8 Loopback
  if (b0 === 127) return true;
  // 10.0.0.0/8 Private
  if (b0 === 10) return true;
  // 172.16.0.0/12 Private
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 Private
  if (b0 === 192 && b1 === 168) return true;
  // 169.254.0.0/16 Link-Local / Cloud Metadata (169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 0.0.0.0/8 Current Network
  if (b0 === 0) return true;
  // 100.64.0.0/10 Carrier-grade NAT
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 198.18.0.0/15 Benchmark
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
  // 224.0.0.0/4 Multicast or 240.0.0.0/4 Reserved
  if (b0 >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to private or link-local ranges.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // Loopback ::1
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  // Link-local fe80::/10
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  // Unique local fc00::/7
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // IPv4 mapped ::ffff:x.x.x.x
  if (normalized.includes("::ffff:")) {
    const ipv4 = normalized.split("::ffff:")[1];
    if (ipv4 && net.isIPv4(ipv4)) {
      return isPrivateIPv4(ipv4);
    }
  }
  return false;
}

/**
 * Validates a remote video URL against SSRF attacks.
 * Blocks:
 * 1. Non-HTTP(S) protocols (file:, ftp:, gopher:, dict:, data:)
 * 2. Localhost, loopback, private RFC1918, link-local, and cloud metadata IPs
 * 3. Non-approved destination hostnames
 */
export async function validateRemoteVideoUrl(rawUrl: string): Promise<{
  url: string;
  hostname: string;
  contentType: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError("Invalid remote URL format.", 400, "INVALID_URL");
  }

  // 1. Enforce HTTPS (allow HTTP only in non-production for testing)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError(
      `Unsupported protocol '${parsed.protocol}'. Only HTTP(S) video URLs are permitted.`,
      400,
      "DISALLOWED_PROTOCOL",
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject obvious dangerous hostnames
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname === "metadata.google.internal" ||
    hostname.includes("169.254.169.254")
  ) {
    throw new AppError(
      "Access to private/local network resources is forbidden.",
      403,
      "SSRF_BLOCKED",
    );
  }

  // 3. Reject direct raw IP addresses
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) {
      throw new AppError("Access to private IP ranges is forbidden.", 403, "SSRF_BLOCKED");
    }
    if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) {
      throw new AppError("Access to private IPv6 ranges is forbidden.", 403, "SSRF_BLOCKED");
    }
  }

  // 4. Check against approved video domain list
  const isApproved = APPROVED_VIDEO_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );

  if (!isApproved) {
    throw new AppError(
      `Remote ingestion from '${hostname}' is not supported. Supported sources: ${APPROVED_VIDEO_DOMAINS.join(", ")}`,
      422,
      "UNSUPPORTED_REMOTE_SOURCE",
    );
  }

  // 5. DNS resolution check to prevent DNS rebinding to private IPs
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (addr.family === 4 && isPrivateIPv4(addr.address)) {
        throw new AppError(
          "Target domain resolves to a forbidden private network address.",
          403,
          "SSRF_DNS_REBINDING_BLOCKED",
        );
      }
      if (addr.family === 6 && isPrivateIPv6(addr.address)) {
        throw new AppError(
          "Target domain resolves to a forbidden IPv6 network address.",
          403,
          "SSRF_DNS_REBINDING_BLOCKED",
        );
      }
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`DNS resolution failed for remote host '${hostname}'.`, 400, "DNS_LOOKUP_FAILED");
  }

  // Infer content type from path
  const lowerPath = parsed.pathname.toLowerCase();
  let contentType = "video/mp4";
  if (lowerPath.endsWith(".webm")) contentType = "video/webm";
  else if (lowerPath.endsWith(".mov")) contentType = "video/quicktime";
  else if (lowerPath.endsWith(".mkv")) contentType = "video/x-matroska";

  return {
    url: rawUrl,
    hostname,
    contentType,
  };
}
