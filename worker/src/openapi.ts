export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Cloudflare License Service",
    version: "0.1.0",
    description: "Cloudflare-native activation and offline license API."
  },
  paths: {
    "/api/client/activate": {
      post: {
        summary: "Exchange an activation code for a signed offline license",
        responses: {
          "200": { description: "Signed license" },
          "4XX": { description: "Structured activation error" }
        }
      }
    },
    "/api/client/deactivate": {
      post: {
        summary: "Deactivate the current machine for a license",
        responses: {
          "200": { description: "Deactivation result" }
        }
      }
    },
    "/api/admin/products": {
      get: { summary: "List products", responses: { "200": { description: "Products" } } },
      post: { summary: "Create product", responses: { "200": { description: "Product" } } }
    },
    "/api/admin/products/{id}": {
      patch: { summary: "Update product", responses: { "200": { description: "Product" } } }
    },
    "/api/admin/batches": {
      get: { summary: "List batches", responses: { "200": { description: "Batches" } } },
      post: {
        summary: "Create a batch and generate activation codes",
        responses: { "200": { description: "Batch and generated codes" } }
      }
    },
    "/api/admin/batches/{id}": {
      get: { summary: "Read batch detail", responses: { "200": { description: "Batch detail" } } }
    },
    "/api/admin/licenses": {
      get: { summary: "Search licenses", responses: { "200": { description: "Licenses" } } }
    },
    "/api/admin/licenses/{id}": {
      get: { summary: "Read license detail", responses: { "200": { description: "License detail" } } }
    },
    "/api/admin/licenses/{id}/disable": {
      post: { summary: "Disable license", responses: { "200": { description: "License" } } }
    },
    "/api/admin/licenses/{id}/enable": {
      post: { summary: "Enable disabled license", responses: { "200": { description: "License" } } }
    },
    "/api/admin/licenses/{id}/revoke": {
      post: { summary: "Revoke license", responses: { "200": { description: "License" } } }
    },
    "/api/admin/licenses/export.csv": {
      get: { summary: "Export licenses as CSV", responses: { "200": { description: "CSV" } } }
    },
    "/license/{userId}/{licenseKey}/verify": {
      get: { summary: "LicenseGate-compatible verify", responses: { "200": { description: "Validation result" } } },
      post: { summary: "LicenseGate-compatible verify", responses: { "200": { description: "Validation result" } } }
    }
  }
};
