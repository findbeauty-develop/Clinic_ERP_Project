import { applyDecorators, Header } from "@nestjs/common";
import { ApiHeader } from "@nestjs/swagger";

export function NoCache() {
  return applyDecorators(
    Header("Cache-Control", "no-store, no-cache, must-revalidate"),
    Header("Pragma", "no-cache"),
    Header("Expires", "0")
  );
}

export function ApiKeyHeader() {
  return applyDecorators(
    ApiHeader({
      name: "x-api-key",
      description: "API Key for supplier-to-clinic authentication",
    })
  );
}
