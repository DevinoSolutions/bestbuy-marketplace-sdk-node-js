import type {
  AdditionalFieldDefinition,
  AdditionalFieldParams,
  AttributeParams,
  CatalogApi,
  Hierarchy,
  HierarchyParams,
  ProductAttribute,
  RequestOptions,
  ValueList,
  ValueListParams,
} from "../types.js";
import type { BestBuyHttpClient, QueryValue } from "../client/http.js";
import {
  additionalFieldListSchema,
  attributeListSchema,
  hierarchyListSchema,
  parseWith,
  valueListsSchema,
} from "../schemas/wire.js";
import { joinList } from "../schemas/inputs.js";

/** Builds the `catalog` namespace: operator metadata, entirely read-only. */
export function createCatalogApi(http: BestBuyHttpClient): CatalogApi {
  return {
    async hierarchies(params?: HierarchyParams, options?: RequestOptions): Promise<Hierarchy[]> {
      const query: Record<string, QueryValue> = {};
      if (params?.hierarchy !== undefined) query.hierarchy = params.hierarchy;
      if (params?.maxLevel !== undefined) query.max_level = params.maxLevel;
      const raw = await http.requestJson({ operation: "catalog.hierarchies", query }, options);
      return parseWith(hierarchyListSchema, raw, "hierarchy list").hierarchies;
    },

    async attributes(
      params?: AttributeParams,
      options?: RequestOptions,
    ): Promise<ProductAttribute[]> {
      const query: Record<string, QueryValue> = {};
      if (params?.hierarchy !== undefined) query.hierarchy = params.hierarchy;
      if (params?.maxLevel !== undefined) query.max_level = params.maxLevel;
      if (params?.withRoles !== undefined) query.with_roles = params.withRoles;
      const raw = await http.requestJson({ operation: "catalog.attributes", query }, options);
      return parseWith(attributeListSchema, raw, "attribute list").attributes;
    },

    async valueLists(params?: ValueListParams, options?: RequestOptions): Promise<ValueList[]> {
      const query: Record<string, QueryValue> = {};
      if (params?.code !== undefined) query.code = params.code;
      const raw = await http.requestJson({ operation: "catalog.valueLists", query }, options);
      return parseWith(valueListsSchema, raw, "value lists").values_lists;
    },

    async additionalFields(
      params?: AdditionalFieldParams,
      options?: RequestOptions,
    ): Promise<AdditionalFieldDefinition[]> {
      const query: Record<string, QueryValue> = {};
      const entities = joinList(params?.entities);
      if (entities !== undefined) query.entities = entities;
      const raw = await http.requestJson({ operation: "catalog.additionalFields", query }, options);
      return parseWith(additionalFieldListSchema, raw, "additional field list").additional_fields;
    },
  };
}
