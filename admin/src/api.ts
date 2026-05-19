class ApiClient {
  async get(path: string): Promise<Response> {
    return fetch(path, {
      credentials: "same-origin",
      headers: { "Accept": "application/json" },
    });
  }

  async post(path: string, body: unknown): Promise<Response> {
    return fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  async patch(path: string, body: unknown): Promise<Response> {
    return fetch(path, {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });
  }
}

export const api = new ApiClient();