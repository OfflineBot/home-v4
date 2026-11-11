class HomeV4Api {
  constructor() {
    this.name = "homeV4Api";
    this.displayName = "home-v4";
    this.documentationUrl = "";
    this.properties = [
      {
        displayName: "Backend URL",
        name: "baseUrl",
        type: "string",
        default: "http://backend:8080",
      },
      {
        displayName: "Token",
        name: "token",
        type: "string",
        typeOptions: { password: true },
        default: "",
      },
    ];
    this.authenticate = {
      type: "generic",
      properties: {
        headers: { Authorization: "=Bearer {{$credentials.token}}" },
      },
    };
    this.test = {
      request: {
        baseURL: "={{$credentials.baseUrl}}",
        url: "/api/integration/me",
      },
    };
  }
}

module.exports = { HomeV4Api };
