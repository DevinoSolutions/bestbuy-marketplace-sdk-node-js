/**
 * Runtime validation for Best Buy (Mirakl) wire payloads.
 *
 * Mirakl is JSON-native: numbers arrive as numbers, booleans as booleans, dates as ISO-8601
 * strings. That is the whole reason this SDK can be thin. Two habits keep it honest anyway:
 *
 * - Every object schema is **loose** (`z.looseObject`, the zod-4 spelling of `passthrough`),
 *   so fields the operator adds survive validation instead of being stripped.
 * - Every response is parsed, so a shape change surfaces as a
 *   {@link BestBuyValidationError} at the call site rather than as `undefined` three layers
 *   deeper.
 *
 * Shapes marked VERIFIED in `docs/research/bestbuy-api-contracts.md` were parsed from real
 * read-only responses captured against the live shop on 2026-09-11; the rest are still
 * **ASSUMPTION**. Fields the live payloads carry are typed here; fields only Mirakl's
 * documentation mentions are typed optional so an operator that omits them still parses.
 */
import { z } from "zod";
import { BestBuyValidationError, type BestBuyValidationIssue } from "../errors/index.js";

/** Maps zod issues onto the SDK transport-independent issue shape. */
function issuesFrom(error: z.ZodError): BestBuyValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join("."),
    message: issue.message,
    code: issue.code,
  }));
}

/** Parses a value against a schema, throwing {@link BestBuyValidationError} on mismatch. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  value: unknown,
  context: string,
): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BestBuyValidationError(`Unexpected ${context} payload from the Best Buy API`, {
      issues: issuesFrom(result.error),
    });
  }
  return result.data;
}

/** `{ locale, value }` pairs Mirakl attaches to every operator-configured label. */
const localizedLabelSchema = z.looseObject({
  locale: z.string(),
  value: z.string(),
});

/** A `code` / `type` / `value` triple — Mirakl's shape for every custom field. */
const additionalFieldSchema = z.looseObject({
  code: z.string(),
  type: z.string().optional(),
  value: z.string().nullish(),
});

/**
 * Discount as it comes back on a READ. Note the field is `discount_price` here while the
 * OF24 write payload spells the same idea `price` — that asymmetry is upstream's.
 */
const discountSchema = z.looseObject({
  discount_price: z.number().optional(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  origin_price: z.number().nullish(),
  ranges: z.array(z.looseObject({ price: z.number(), quantity_threshold: z.number() })).nullish(),
});

const volumePriceSchema = z.looseObject({
  price: z.number(),
  quantity_threshold: z.number(),
  unit_origin_price: z.number().nullish(),
  unit_discount_price: z.number().nullish(),
});

/** One entry of `all_prices`, and the shape of `applicable_pricing`. */
const pricingSchema = z.looseObject({
  price: z.number(),
  unit_origin_price: z.number().nullish(),
  unit_discount_price: z.number().nullish(),
  channel_code: z.string().nullish(),
  discount_start_date: z.string().nullish(),
  discount_end_date: z.string().nullish(),
  volume_prices: z.array(volumePriceSchema).nullish(),
  context: z
    .looseObject({
      channel_codes: z.array(z.string()).nullish(),
      customer_group_ids: z.array(z.string()).nullish(),
      customer_organization_ids: z.array(z.string()).nullish(),
      start_date: z.string().nullish(),
      end_date: z.string().nullish(),
    })
    .nullish(),
});

const productReferenceSchema = z.looseObject({
  reference: z.string(),
  reference_type: z.string(),
});

const accountShippingSchema = z.looseObject({
  shipping_type_code: z.string(),
  shipping_type_label: z.string().optional(),
  shipping_type_standard_code: z.string().nullish(),
  shipping_zone_code: z.string(),
  shipping_zone_label: z.string().optional(),
  shipping_free_amount: z.number().nullish(),
  additional_fields: z.array(additionalFieldSchema).nullish(),
});

export const accountSchema = z.looseObject({
  shop_id: z.number(),
  shop_name: z.string().optional(),
  shop_state: z.string().optional(),
  currency_iso_code: z.string().optional(),
  premium: z.boolean().optional(),
  date_created: z.string().optional(),
  last_updated_date: z.string().optional(),
  closed_from: z.string().nullish(),
  closed_to: z.string().nullish(),
  suspension_type: z.string().nullish(),
  model: z.string().optional(),
  description: z.string().nullish(),
  banner: z.string().nullish(),
  logo: z.string().nullish(),
  grade: z.number().nullish(),
  approval_delay: z.number().nullish(),
  approval_rate: z.number().nullish(),
  order_messages_response_delay: z.number().nullish(),
  evaluations_count: z.number().optional(),
  offers_count: z.number().optional(),
  orders_count: z.number().optional(),
  free_shipping: z.boolean().optional(),
  is_professional: z.boolean().optional(),
  payment_method_mandatory: z.boolean().optional(),
  return_policy: z.string().nullish(),
  channels: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  shipping: z.looseObject({ lead_time_to_ship: z.number().nullish() }).optional(),
  shipping_country: z.string().nullish(),
  shipping_types: z.array(z.string()).optional(),
  shipping_zones: z.array(z.string()).optional(),
  shippings: z.array(accountShippingSchema).optional(),
  shop_additional_fields: z.array(additionalFieldSchema).optional(),
  payment_details: z
    .looseObject({
      paid_balance: z.number().optional(),
      payable_balance: z.number().optional(),
      pending_balance: z.number().optional(),
    })
    .optional(),
  applicable_taxes: z
    .array(
      z.looseObject({
        code: z.string(),
        label: z.string().optional(),
        fee_types: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  contact_informations: z
    .looseObject({
      civility: z.string().nullish(),
      firstname: z.string().nullish(),
      lastname: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
      phone_secondary: z.string().nullish(),
      fax: z.string().nullish(),
      street1: z.string().nullish(),
      street2: z.string().nullish(),
      city: z.string().nullish(),
      state: z.string().nullish(),
      country: z.string().nullish(),
      zip_code: z.string().nullish(),
      web_site: z.string().nullish(),
    })
    .optional(),
});

export const offerSchema = z.looseObject({
  offer_id: z.number(),
  shop_sku: z.string(),
  product_sku: z.string().optional(),
  product_title: z.string().optional(),
  product_brand: z.string().nullish(),
  product_description: z.string().nullish(),
  price: z.number(),
  total_price: z.number().optional(),
  msrp: z.number().nullish(),
  price_additional_info: z.string().nullish(),
  all_prices: z.array(pricingSchema).optional(),
  applicable_pricing: pricingSchema.nullish(),
  quantity: z.number(),
  min_quantity_alert: z.number().optional(),
  state_code: z.string().optional(),
  active: z.boolean().optional(),
  allow_quote_requests: z.boolean().optional(),
  inactivity_reasons: z.array(z.string()).optional(),
  description: z.string().nullish(),
  leadtime_to_ship: z.number().optional(),
  shipping_deadline: z.string().nullish(),
  discount: discountSchema.nullish(),
  available_start_date: z.string().nullish(),
  available_end_date: z.string().nullish(),
  category_code: z.string().optional(),
  category_label: z.string().optional(),
  channels: z.array(z.string()).optional(),
  currency_iso_code: z.string().optional(),
  // Object on reads (`{ code, label }`); a bare code string on OF24 writes.
  logistic_class: z.looseObject({ code: z.string(), label: z.string().optional() }).nullish(),
  fulfillment: z
    .looseObject({ center: z.looseObject({ code: z.string().optional() }).optional() })
    .nullish(),
  min_shipping_price: z.number().nullish(),
  min_shipping_price_additional: z.number().nullish(),
  min_shipping_type: z.string().nullish(),
  min_shipping_zone: z.string().nullish(),
  offer_additional_fields: z.array(additionalFieldSchema).optional(),
  warehouses: z
    .array(z.looseObject({ code: z.string(), quantity: z.number().optional() }))
    .nullish(),
  product_references: z.array(productReferenceSchema).optional(),
});

export const offerListSchema = z.looseObject({
  offers: z.array(offerSchema),
  total_count: z.number(),
});

export const offerStateListSchema = z.looseObject({
  offer_states: z.array(z.looseObject({ code: z.string(), label: z.string().optional() })),
});

export const importTicketSchema = z.looseObject({
  import_id: z.number(),
});

// The live OF02 body spells the outcome `status` (VERIFIED 2026-09-16); `import_status`, the
// spelling Mirakl's docs use, has never been observed here but still parses.
export const offerImportStatusSchema = z.looseObject({
  import_id: z.number(),
  status: z.string().optional(),
  import_status: z.string().optional(),
  mode: z.string().optional(),
  type: z.string().optional(),
  has_error_report: z.boolean().optional(),
  lines_read: z.number().optional(),
  lines_in_success: z.number().optional(),
  lines_in_error: z.number().optional(),
  lines_in_pending: z.number().optional(),
  offer_inserted: z.number().optional(),
  offer_updated: z.number().optional(),
  offer_deleted: z.number().optional(),
  date_created: z.string().optional(),
  date_process_started: z.string().optional(),
  date_process_ended: z.string().optional(),
});

const productSchema = z.looseObject({
  product_sku: z.string().optional(),
  product_title: z.string().optional(),
  product_id: z.string().optional(),
  product_id_type: z.string().optional(),
  category_code: z.string().optional(),
  category_label: z.string().optional(),
  shop_sku: z.string().optional(),
  product_references: z.array(productReferenceSchema).optional(),
  active: z.boolean().optional(),
});

export const productListSchema = z.looseObject({
  products: z.array(productSchema),
  total_count: z.number(),
});

export const productImportStatusSchema = z.looseObject({
  import_id: z.number(),
  import_status: z.string().optional(),
  has_error_report: z.boolean().optional(),
  transformed_lines: z.number().optional(),
  integrated_products: z.number().optional(),
  lines_in_error: z.number().optional(),
  date_created: z.string().optional(),
  date_process_started: z.string().optional(),
  date_process_ended: z.string().optional(),
});

export const hierarchyListSchema = z.looseObject({
  hierarchies: z.array(
    z.looseObject({
      code: z.string(),
      label: z.string().optional(),
      label_translations: z.array(localizedLabelSchema).optional(),
      level: z.number().optional(),
      // Live: a root node reports `""`, not null. Both are accepted.
      parent_code: z.string().nullish(),
      update_date: z.string().optional(),
    }),
  ),
});

const attributeRoleSchema = z.looseObject({
  type: z.string(),
  parameters: z.array(z.looseObject({ name: z.string(), value: z.string().nullish() })).optional(),
});

export const attributeListSchema = z.looseObject({
  attributes: z.array(
    z.looseObject({
      code: z.string(),
      label: z.string().optional(),
      label_translations: z.array(localizedLabelSchema).optional(),
      description: z.string().nullish(),
      description_translations: z.array(localizedLabelSchema).optional(),
      type: z.string().optional(),
      type_parameter: z.string().nullish(),
      type_parameters: z.array(z.looseObject({ name: z.string(), value: z.string() })).nullish(),
      required: z.boolean().optional(),
      requirement_level: z.string().optional(),
      variant: z.boolean().optional(),
      roles: z.array(attributeRoleSchema).optional(),
      hierarchy_code: z.string().nullish(),
      // Live spelling is `values_list`; stock Mirakl docs also mention `values_list_code`.
      values_list: z.string().nullish(),
      values_list_code: z.string().nullish(),
      values: z.array(z.looseObject({ code: z.string(), label: z.string().optional() })).nullish(),
      default_value: z.string().nullish(),
      example: z.string().nullish(),
      validations: z.string().nullish(),
      transformations: z.string().nullish(),
    }),
  ),
});

export const valueListsSchema = z.looseObject({
  values_lists: z.array(
    z.looseObject({
      code: z.string(),
      label: z.string().optional(),
      label_translations: z.array(localizedLabelSchema).optional(),
      values: z
        .array(
          z.looseObject({
            code: z.string(),
            label: z.string().optional(),
            label_translations: z.array(localizedLabelSchema).optional(),
          }),
        )
        .optional(),
    }),
  ),
});

export const additionalFieldListSchema = z.looseObject({
  additional_fields: z.array(
    z.looseObject({
      code: z.string(),
      label: z.string().optional(),
      description: z.string().optional(),
      entity: z.string().optional(),
      type: z.string().optional(),
      required: z.boolean().optional(),
      editable: z.boolean().optional(),
      regex: z.string().optional(),
    }),
  ),
});

export const carrierListSchema = z.looseObject({
  carriers: z.array(
    z.looseObject({
      code: z.string(),
      label: z.string().optional(),
      standard_code: z.string().optional(),
      tracking_url: z.string().optional(),
    }),
  ),
});

// The envelope key is `shipping_zones`, not `zones` (live-verified 2026-09-11).
export const zoneListSchema = z.looseObject({
  shipping_zones: z.array(
    z.looseObject({
      code: z.string(),
      label: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
});

export const shippingTypeListSchema = z.looseObject({
  shipping_types: z.array(
    z.looseObject({
      code: z.string(),
      label: z.string().optional(),
      description: z.string().optional(),
      standard_code: z.string().optional(),
      click_and_collect: z.boolean().optional(),
      delivery_by_operator: z.boolean().optional(),
      ignore_lead_time_to_ship: z.boolean().optional(),
      mandatory_tracking: z.boolean().optional(),
    }),
  ),
});

const orderLineSchema = z.looseObject({
  order_line_id: z.string(),
  order_line_state: z.string().optional(),
  order_line_state_reason_code: z.string().nullish(),
  offer_id: z.number().optional(),
  offer_sku: z.string().optional(),
  product_sku: z.string().optional(),
  product_title: z.string().optional(),
  quantity: z.number(),
  price: z.number().optional(),
  total_price: z.number().optional(),
  shipping_price: z.number().optional(),
  commission_fee: z.number().optional(),
  can_refund: z.boolean().optional(),
});

export const orderSchema = z.looseObject({
  order_id: z.string(),
  commercial_id: z.string().optional(),
  order_state: z.string().optional(),
  order_state_reason_code: z.string().nullish(),
  created_date: z.string().optional(),
  last_updated_date: z.string().optional(),
  acceptance_decision_date: z.string().nullish(),
  customer_debited_date: z.string().nullish(),
  can_cancel: z.boolean().optional(),
  currency_iso_code: z.string().optional(),
  price: z.number().optional(),
  total_price: z.number().optional(),
  total_commission: z.number().optional(),
  shipping_price: z.number().optional(),
  shipping_type_code: z.string().optional(),
  shipping_company: z.string().nullish(),
  shipping_tracking: z.string().nullish(),
  shipping_tracking_url: z.string().nullish(),
  customer: z
    .looseObject({
      customer_id: z.string().optional(),
      firstname: z.string().optional(),
      lastname: z.string().optional(),
      civility: z.string().optional(),
      locale: z.string().optional(),
    })
    .optional(),
  order_lines: z.array(orderLineSchema),
});

export const orderListSchema = z.looseObject({
  orders: z.array(orderSchema),
  total_count: z.number(),
});
