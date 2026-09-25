export const WebAuthnCommands = {
  disable: 'WebAuthn.disable',
  enable: 'WebAuthn.enable',
  addVirtualAuthenticator: 'WebAuthn.addVirtualAuthenticator',
  addCredential: 'WebAuthn.addCredential',
} as const;

export const VirtualAuthenticatorOptions = {
  protocol: 'ctap2',
  transport: 'internal',
} as const;
