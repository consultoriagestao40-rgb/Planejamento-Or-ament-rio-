
interface ContaAzulTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

// V36: ROTA COGNITO (V2) COM DESCOBERTA DE DADOS.
// O teste na V35 provou que este Client ID NÃO é do sistema antigo.
const CA_AUTH_URL = 'https://auth.contaazul.com/login';
const CA_TOKEN_URL = 'https://auth.contaazul.com/oauth2/token';

export const getAuthUrl = (state: string) => {
    // Priority: Env Vars > Hardcoded
    const clientId = process.env.CONTA_AZUL_CLIENT_ID || '4obnij6ehp1q45oecojivdta7n'.trim();

    // V52: Ultra-Minimal Scope (Finance Resource Only, No OIDC)
    const scope = 'finance offline_access';

    const isDev = process.env.NODE_ENV === 'development';
    const baseUrl = isDev ? 'http://127.0.0.1:3000' : 'https://planejamento-or-ament-rio.vercel.app';
    const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI || `${baseUrl}/api/auth/callback`;

    // V53: Remove SCOPE param entirely to rely on Default App Permissions
    // This is often required for legacy Apps that don't support dynamic scopes
    return `${CA_AUTH_URL}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&response_type=code`;
};

export const exchangeCodeForToken = async (code: string): Promise<ContaAzulTokenResponse> => {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID || '4obnij6ehp1q45oecojivdta7n'.trim();
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET || '1nhd3b2mu9hoo6o2qkhr7unn376m5lets1gvfdcd7lkie5vpoo49'.trim();

    const isDev = process.env.NODE_ENV === 'development';
    const baseUrl = isDev ? 'http://127.0.0.1:3000' : 'https://planejamento-or-ament-rio.vercel.app';
    const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI || `${baseUrl}/api/auth/callback`;

    // Standard OAuth2 uses Basic Auth for the token exchange
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(CA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri!,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to exchange token: ${errorBody}`);
    }

    return response.json();
};

export const refreshAccessToken = async (refreshToken: string): Promise<ContaAzulTokenResponse> => {
    // Priority: Env Vars > Hardcoded
    const clientId = process.env.CONTA_AZUL_CLIENT_ID || '4obnij6ehp1q45oecojivdta7n'.trim();
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET || '1nhd3b2mu9hoo6o2qkhr7unn376m5lets1gvfdcd7lkie5vpoo49'.trim();

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(CA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to refresh token: ${errorBody}`);
    }

    return response.json();
};
