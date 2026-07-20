export function googleAccountChooserOptions(clientId: string) {
  return {
    client_id: clientId,
    scope: "openid email profile",
    prompt: "select_account" as const,
  };
}
