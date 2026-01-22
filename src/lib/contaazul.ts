interface ContaAzulTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

const CA_AUTH_URL = 'https://api.contaazul.com/auth/authorize';
const CA_TOKEN_URL = 'https://api.contaazul.com/oauth2/token';

export const getAuthUrl = (state: string) => {
    // HARDCODED DEBUGGING - Eliminar variáveis de ambiente como causa
    const clientId = '1ef2vcspum8aqpb6agd5ki57v1';
    const redirectUri = 'https://planejamento-or-ament-rio.vercel.app/api/auth/callback';
    const scope = 'sales';
    const stateVal = 'security_token_123'; // Static state for test

    return `${CA_AUTH_URL}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(stateVal)}&response_type=code`;
};

export const exchangeCodeForToken = async (code: string): Promise<ContaAzulTokenResponse> => {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
    const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI + '?v=2';

    const response = await fetch(CA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri!,
            client_id: clientId!,
            client_secret: clientSecret!
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to exchange token: ${errorBody}`);
    }

    return response.json();
};

export const refreshAccessToken = async (refreshToken: string): Promise<ContaAzulTokenResponse> => {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;

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
