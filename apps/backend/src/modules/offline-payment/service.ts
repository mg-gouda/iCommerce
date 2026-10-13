import { AbstractPaymentProvider, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  InitiatePaymentOutput,
  PaymentProviderInput,
  PaymentProviderOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"

// No external gateway: money moves offline, Medusa only tracks the state.
// Checkout authorizes immediately (order can be placed); capture happens later
// (COD: vendor marks delivered · bank transfer: admin confirms the transfer).
abstract class OfflinePayment extends AbstractPaymentProvider {
  constructor(cradle: Record<string, unknown>, options: Record<string, unknown>) {
    super(cradle, options)
  }

  protected extraData(): Record<string, unknown> {
    return {}
  }

  async initiatePayment(): Promise<InitiatePaymentOutput> {
    return { id: `offline_${Date.now()}`, data: this.extraData() }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.data }
  }

  async getPaymentStatus(input: PaymentProviderInput) {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.data }
  }

  async getWebhookActionAndData(): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }

  // ponytail: refunds are manual (cash / bank), so capture, refund, cancel just echo state.
  async capturePayment(input: PaymentProviderInput): Promise<PaymentProviderOutput> {
    return { data: input.data }
  }
  async refundPayment(input: PaymentProviderInput): Promise<PaymentProviderOutput> {
    return { data: input.data }
  }
  async cancelPayment(input: PaymentProviderInput): Promise<PaymentProviderOutput> {
    return { data: input.data }
  }
  async deletePayment(input: PaymentProviderInput): Promise<PaymentProviderOutput> {
    return { data: input.data }
  }
  async retrievePayment(input: PaymentProviderInput): Promise<PaymentProviderOutput> {
    return { data: input.data }
  }
  async updatePayment(input: PaymentProviderInput): Promise<PaymentProviderOutput> {
    return { data: input.data }
  }
}

export class CodPayment extends OfflinePayment {
  static identifier = "cod"
}

export class BankTransferPayment extends OfflinePayment {
  static identifier = "bank-transfer"
  protected extraData() {
    return { bank_details: process.env.BANK_TRANSFER_DETAILS ?? "" }
  }
}

// Credit (net terms). Eligibility + limit are checked by the completeCart `validate` hook and on quote acceptance
// (lib/net-terms.ts): a provider can't read the company module. Invoice opens on order.placed, captured on mark-paid.
export class NetTermsPayment extends OfflinePayment {
  static identifier = "net-terms"
}

export const COD_PROVIDER = "pp_cod_cod"
export const NET_TERMS_PROVIDER = "pp_net-terms_net-terms"
export const BANK_PROVIDER = "pp_bank-transfer_bank-transfer"
