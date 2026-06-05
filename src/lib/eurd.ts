export interface PaymentRequestResponse {
  code: string;
  shareableLink: string;
  qrCodeString: string;
}

export interface PaymentRequestListItem {
  code: string;
  status: string;
  requestedAmount: number;
}

interface ApiError {
  code: string;
  message: string;
}

export class EurdApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errors: ApiError[]
  ) {
    super(errors.map((e) => e.message).join("; "));
    this.name = "EurdApiError";
  }
}

export class EurdClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    baseUrl = process.env.QUANTOZ_BASE_URL ?? "https://api.quantozpay.com",
    apiKey = process.env.EURD_API_KEY ?? ""
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: unknown
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    if (!text) {
      if (!res.ok)
        throw new EurdApiError(res.status, [{ code: String(res.status), message: res.statusText }]);
      return undefined as T;
    }

    const json = JSON.parse(text) as Record<string, unknown>;
    if (!res.ok) {
      const errors = (json?.errors as ApiError[] | undefined) ?? [
        { code: String(res.status), message: res.statusText },
      ];
      throw new EurdApiError(res.status, errors);
    }

    return ((json?.value ?? json) as T);
  }

  createPaymentRequest(body: {
    accountCode: string;
    amount: number;
    options: {
      expiresOn: string;
      shareName: boolean;
      isOneOffPayment: boolean;
      payerCanChangeRequestedAmount: boolean;
      message?: string;
      callbackUrl?: string;
    };
  }): Promise<PaymentRequestResponse> {
    return this.request("POST", "/payment-request", undefined, body);
  }

  listPaymentRequests(params?: {
    paymentRequestCode?: string;
    status?: string;
    accountCode?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: PaymentRequestListItem[]; total: number }> {
    return this.request("GET", "/payment-request", params);
  }

  /**
   * Fetch a transaction by its transaction code.
   * The response includes `blockchainTxId` once Quantoz has settled on-chain.
   */
  getTransaction(txCode: string): Promise<{
    items: TransactionListItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    return this.request("GET", "/transaction", { txCode, pageSize: 1 });
  }
}

export interface TransactionListItem {
  transactionCode: string;
  fromAccountCode: string;
  toAccountCode: string;
  senderName?: string;
  receiverName?: string;
  amount: number;
  tokenCode: string;
  created?: string;
  finished?: string;
  status: string;
  type: string;
  memo?: string;
  message?: string;
  direction?: string;
  metadata?: string;
  /** Algorand transaction ID — populated once on-chain settlement completes */
  blockchainTxId?: string;
}
