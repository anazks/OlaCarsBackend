const https = require('https');

let cachedToken = null;
let tokenExpiresAt = null;

const normalizeAccountNumber = (raw) => {
    if (!raw) return '';
    return String(raw).replace(/[\s\-_]/g, '').trim();
};

const extractTokenFromResponse = (data) => {
    if (!data) return null;
    if (typeof data === 'string') return data;
    if (data.Token) return data.Token;
    if (data.token) return data.token;
    if (data.access_token) return data.access_token;
    if (data.accessToken) return data.accessToken;
    if (data.data?.Token) return data.data.Token;
    if (data.data?.token) return data.data.token;
    for (const key of Object.keys(data)) {
        if (key.toLowerCase().includes('token') && typeof data[key] === 'string') {
            return data[key];
        }
    }
    return null;
};

const getBancoGeneralAccessToken = async (forceRefresh = false) => {
    const baseUrl = (process.env.BANCO_GENERAL_BASE_URL || 'https://conexionbg.bgeneral.cloud').replace(/\/$/, '');
    const clientId = process.env.BANCO_GENERAL_CLIENT_ID;
    const clientSecret = process.env.BANCO_GENERAL_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId === 'YOUR_CLIENT_ID') {
        throw new Error('Banco General credentials not configured. Please set BANCO_GENERAL_CLIENT_ID and BANCO_GENERAL_CLIENT_SECRET in .env.');
    }

    if (!forceRefresh && cachedToken && (!tokenExpiresAt || Date.now() < tokenExpiresAt)) {
        return cachedToken;
    }

    const authUrl = `${baseUrl}/autenticacion/autenticar`;
    const response = await fetch(authUrl, {
        method: 'GET',
        headers: {
            'x-ibm-client-id': clientId,
            'x-ibm-client-secret': clientSecret,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Banco General Auth failed (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    const token = extractTokenFromResponse(data);
    if (!token) {
        throw new Error('Unable to extract access token from Banco General authentication response');
    }

    cachedToken = token;
    const expiresIn = data.expires_in || 3600;
    tokenExpiresAt = Date.now() + (expiresIn * 1000) - 60000;
    return token;
};

const fetchLiveAccountTransactions = async (rawAccountNumber, options = {}) => {
    const baseUrl = (process.env.BANCO_GENERAL_BASE_URL || 'https://conexionbg.bgeneral.cloud').replace(/\/$/, '');
    const clientId = process.env.BANCO_GENERAL_CLIENT_ID;
    const clientSecret = process.env.BANCO_GENERAL_CLIENT_SECRET;
    const cleanAccount = normalizeAccountNumber(rawAccountNumber);

    const hasRealCredentials = Boolean(
        clientId && clientSecret && 
        clientId !== 'YOUR_CLIENT_ID' && 
        clientSecret !== 'YOUR_CLIENT_SECRET'
    );

    if (!hasRealCredentials) {
        // Return structured simulation data when credentials are not configured yet
        return getSimulatedTransactions(cleanAccount, options);
    }

    let token = await getBancoGeneralAccessToken();

    const now = new Date();
    const past30Days = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const fechaDesde = options.fechaDesde || past30Days.toISOString().replace('Z', '');
    const fechaHasta = options.fechaHasta || now.toISOString().replace('Z', '');
    const codProducto = options.codProducto || '3';
    const cantidadRegistros = options.cantidadRegistros || 50;

    const queryParams = new URLSearchParams({
        CodProducto: String(codProducto),
        NumCuenta: cleanAccount,
        Orden: options.orden || 'D',
        CantidadRegistros: String(cantidadRegistros),
        SaldoContable: '0',
        FechaDesde: fechaDesde,
        FechaHasta: fechaHasta
    });

    const apiUrl = `${baseUrl}/h2h/cuentas/referencias?${queryParams.toString()}`;

    let response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'x-ibm-client-id': clientId,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    // Auto-retry once on 401
    if (response.status === 401) {
        token = await getBancoGeneralAccessToken(true);
        response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'x-ibm-client-id': clientId,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    }

    if (!response.ok) {
        const errText = await response.text();
        let formattedMessage = `Banco General API Error (${response.status})`;
        try {
            const parsed = JSON.parse(errText);
            if (parsed.moreInformation) {
                formattedMessage = `Banco General (${response.status}): ${parsed.moreInformation}`;
            } else if (parsed.httpMessage) {
                formattedMessage = `Banco General (${response.status}): ${parsed.httpMessage}`;
            } else if (parsed.message) {
                formattedMessage = `Banco General (${response.status}): ${parsed.message}`;
            }
        } catch (_) {
            if (errText) formattedMessage += `: ${errText}`;
        }
        const err = new Error(formattedMessage);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();

    // Banco General returns transactions in `movimientosH2H` or `referencias`
    const rawList = data.movimientosH2H || data.referencias || [];

    const normalizedReferencias = rawList.map((item) => {
        const naturaleza = (item.naturalezaMovimiento || item.tipoMovimiento || '').toUpperCase();
        const isCredit = naturaleza === 'C' || naturaleza === 'CREDIT';
        const isDebit = naturaleza === 'D' || naturaleza === 'DEBIT';

        const amount = Number(item.monto ?? (isCredit ? item.credito : item.debito) ?? 0);
        const debito = isDebit ? amount : Number(item.debito ?? 0);
        const credito = isCredit ? amount : Number(item.credito ?? 0);

        // Derive channel or reference
        let canal = item.canal;
        if (!canal) {
            const desc = (item.descripcion || '').toUpperCase();
            if (desc.includes('ACH')) canal = 'ACH';
            else if (desc.includes('RESERVA') || desc.includes('TRF')) canal = 'H2H';
            else if (desc.includes('PAGO') || desc.includes('DEPOSITO')) canal = 'BCA';
            else canal = item.causa || 'H2H';
        }

        const ref = item.referencia2 || item.referencia1 || item.numeroReferencia || String(item.idMovimiento || '');
        const sec = String(item.secuencialCuenta || item.secuencia || item.idMovimiento || '');

        return {
            idMovimiento: item.idMovimiento,
            secuencia: sec,
            numeroReferencia: ref,
            fecha: item.fecha,
            descripcion: item.descripcion,
            tipoMovimiento: isCredit ? 'C' : 'D',
            monto: amount,
            debito: debito,
            credito: credito,
            saldo: item.saldoCapital ?? item.saldo ?? 0,
            canal: canal,
            raw: item
        };
    });

    const latestBalance = normalizedReferencias.length > 0 
        ? normalizedReferencias[0].saldo 
        : (data.saldoCapital ?? 0);

    return {
        isLive: true,
        accountNumber: cleanAccount,
        saldoCapital: latestBalance,
        saldoContable: latestBalance,
        saldoDisponible: latestBalance,
        moneda: data.moneda || 'USD',
        cantidadRegistros: normalizedReferencias.length,
        referencias: normalizedReferencias,
        rawStatus: data.status
    };
};

const getSimulatedTransactions = (accountNumber, options = {}) => {
    const today = new Date();
    const formatDate = (offsetDays, hours = 10, mins = 30) => {
        const d = new Date(today);
        d.setDate(d.getDate() - offsetDays);
        d.setHours(hours, mins, 0, 0);
        return d.toISOString();
    };

    return {
        isLive: false,
        isSimulated: true,
        message: "Notice: Banco General credentials not configured in .env. Displaying sample transactions for preview.",
        numCuenta: accountNumber,
        codProducto: 3,
        saldoCapital: 145820.50,
        saldoContable: 145820.50,
        saldoDisponible: 145820.50,
        moneda: "USD",
        cantidadRegistros: 6,
        referencias: [
            {
                secuencia: "0001849201",
                numeroReferencia: "ACH-2026-849201",
                fecha: formatDate(0, 14, 22),
                descripcion: "ACH - PAGO SEMANAL LEASE JESSICA SOTO",
                tipoMovimiento: "C",
                debito: 0.00,
                credito: 150.00,
                monto: 150.00,
                saldo: 145820.50,
                canal: "ACH"
            },
            {
                secuencia: "0001849195",
                numeroReferencia: "TRF-2026-791240",
                fecha: formatDate(1, 11, 15),
                descripcion: "PAGO FACTURA REPUESTOS AUTO PARTS PANAMA S.A.",
                tipoMovimiento: "D",
                debito: 450.00,
                credito: 0.00,
                monto: 450.00,
                saldo: 145670.50,
                canal: "BCA"
            },
            {
                secuencia: "0001849180",
                numeroReferencia: "ACH-2026-384912",
                fecha: formatDate(2, 9, 30),
                descripcion: "DEPOSITO ACH CLIENTE RODRIGUEZ TRANSPORT",
                tipoMovimiento: "C",
                debito: 0.00,
                credito: 1200.00,
                monto: 1200.00,
                saldo: 146120.50,
                canal: "ACH"
            },
            {
                secuencia: "0001849150",
                numeroReferencia: "TRF-2026-000492",
                fecha: formatDate(3, 16, 45),
                descripcion: "TRANSF INTERBANCARIA A BANCO GENERAL CT 7905",
                tipoMovimiento: "D",
                debito: 2500.00,
                credito: 0.00,
                monto: 2500.00,
                saldo: 144920.50,
                canal: "H2H"
            },
            {
                secuencia: "0001849110",
                numeroReferencia: "ACH-2026-118492",
                fecha: formatDate(4, 10, 12),
                descripcion: "ACH - PAGO SEMANAL LEASE CARLOS MENDEZ",
                tipoMovimiento: "C",
                debito: 0.00,
                credito: 175.00,
                monto: 175.00,
                saldo: 147420.50,
                canal: "ACH"
            },
            {
                secuencia: "0001849080",
                numeroReferencia: "CHQ-2026-009182",
                fecha: formatDate(5, 12, 0),
                descripcion: "COMISION MANTENIMIENTO CUENTA BANCARIA",
                tipoMovimiento: "D",
                debito: 25.00,
                credito: 0.00,
                monto: 25.00,
                saldo: 147245.50,
                canal: "SYS"
            }
        ]
    };
};

module.exports = {
    normalizeAccountNumber,
    getBancoGeneralAccessToken,
    fetchLiveAccountTransactions
};
