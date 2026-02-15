interface ContaAzulTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

const CA_AUTH_URL = 'https://api.contaazul.com/auth/authorize';
const CA_TOKEN_URL = 'https://api.contaazul.com/oauth2/token';

export const getAuthUrl = (state: string) => {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI;
    // Voltando para escopo simples para testar se o espaço estava quebrando o Java da Conta Azul
    const scope = 'sales';

    if (!clientId || !redirectUri) {
        throw new Error('Missing Conta Azul credentials in environment variables');
    }

    return `${CA_AUTH_URL}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;
};

export const exchangeCodeForToken = async (code: string): Promise<ContaAzulTokenResponse> => {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
    const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Missing Conta Azul credentials in environment variables');
    }

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
    // HARDCODED: Garantindo consistência com o restante do arquivo
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Missing Conta Azul credentials in environment variables');
    }

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
