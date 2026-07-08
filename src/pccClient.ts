import type {
  PccSearchResponse,
  PccVendorResponse,
  PccUnitResponse,
  PccTenderDetail,
} from "./types.js";

const DEFAULT_BASE_URL = "https://pcc.g0v.ronny.tw/api";
const DEFAULT_TIMEOUT_MS = 15000;

export class PccApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PccApiError";
  }
}

export interface PccClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export class PccClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: PccClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ?? process.env.PCC_API_BASE_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs =
      options.timeoutMs ??
      Number(process.env.PCC_API_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new PccApiError(
          `PCC API request failed: ${response.status} ${response.statusText}`,
          response.status,
        );
      }
      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof PccApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new PccApiError(
          `PCC API request timed out after ${this.timeoutMs}ms`,
        );
      }
      throw new PccApiError(
        `PCC API request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Search tender/award announcements by keyword, optionally paginated. */
  searchByTitle(query: string, page = 1): Promise<PccSearchResponse> {
    return this.request<PccSearchResponse>("searchbytitle", { query, page });
  }

  /** Get a vendor's award history by vendor name/key. */
  getVendor(vendorName: string): Promise<PccVendorResponse> {
    return this.request<PccVendorResponse>("getvendor", {
      vendor_name: vendorName,
    });
  }

  /** Get an agency/unit's tender and award history. */
  getUnit(unitId: string): Promise<PccUnitResponse> {
    return this.request<PccUnitResponse>("getunit", { unit_id: unitId });
  }

  /** Get the full detail record for a specific tender/award notice. */
  getTenderDetail(
    unitId: string,
    jobNumber: string,
  ): Promise<PccTenderDetail> {
    return this.request<PccTenderDetail>("tender", {
      unit_id: unitId,
      job_number: jobNumber,
    });
  }
}
