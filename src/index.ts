import { ChargePoint } from "./chargepoint";

import * as ocpp from './OcppTs';

const centralSystemSimple = new ocpp.OcppServer();

centralSystemSimple.listen(3000);
const connectedClients: Map<string, ChargePoint> = new Map();

const mockTags = ['1234', '5678', '9876', '5432'];

centralSystemSimple.on('connection', (client: ocpp.OcppClientConnection) => {
    try {
        let isMocking = false;
        let nextStartIsMock = false;
        let nextStopIsMock = false;
        let startMeterValue = 0;

        console.log(`Client ${client.getCpId()} connected`);

        if (connectedClients.has(client.getCpId())) {
            const cp = connectedClients.get(client.getCpId());
            if (!cp) {
                return;
            }
            cp.close();
            connectedClients.delete(client.getCpId());
            return;
        }

        const cp = new ChargePoint(client.getCpId(), `wss://ocpp.io/`, client);
        connectedClients.set(client.getCpId(), cp);

        client.on('close', (code: number, reason: Buffer) => {
            cp.close();
            client.removeAllListeners();
            connectedClients.delete(cp.cpid);
        });

        cp.on('connect', () => {
            client.on('BootNotification', async (request: ocpp.BootNotificationRequest, cb: (response: ocpp.BootNotificationResponse) => void) => {
                console.log(`Client ${cp.cpid} sent BootNotification`, request);
                try {
                    const response = await cp.bootNotification(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for BootNotification`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });

            client.on('Authorize', async (request: ocpp.AuthorizeRequest, cb: (response: ocpp.AuthorizeResponse) => void) => {
                console.log(`Client ${cp.cpid} sent Authorize`, request);

                //we may have to mock the response from the CSMS
                if (mockTags.includes(request.idTag)) {
                    const response: ocpp.AuthorizeResponse = {
                        idTagInfo: {
                            status: 'Accepted'
                        }
                    };
                    console.log(`[MOCK] Response received from CSMS for ${cp.cpid} for Authorize`, response);
                    cb(response);
                    nextStartIsMock = true;
                    return;
                }

                try {
                    const response = await cp.authorize(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for Authorize`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });

            client.on('DataTransfer', async (request: ocpp.DataTransferRequest, cb: (response: ocpp.DataTransferResponse) => void) => {
                console.log(`Client ${cp.cpid} sent DataTransfer`, request);
                try {
                    const response = await cp.dataTransfer(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for DataTransfer`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });

            client.on('DiagnosticsStatusNotification', async (request: ocpp.DiagnosticsStatusNotificationRequest, cb: (response: ocpp.DiagnosticsStatusNotificationResponse) => void) => {
                console.log(`Client ${cp.cpid} sent DiagnosticsStatusNotification`, request);
                try {
                    const response = await cp.diagnosticsStatusNotification(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for DiagnosticsStatusNotification`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });

            client.on('FirmwareStatusNotification', async (request: ocpp.FirmwareStatusNotificationRequest, cb: (response: ocpp.FirmwareStatusNotificationResponse) => void) => {
                console.log(`Client ${cp.cpid} sent FirmwareStatusNotification`, request);
                try {
                    const response = await cp.firmwareStatusNotification(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for FirmwareStatusNotification`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });

            client.on('Heartbeat', async (request: ocpp.HeartbeatRequest, cb: (response: ocpp.HeartbeatResponse) => void) => {
                console.log(`Client ${cp.cpid} sent Heartbeat`, request);
                try {
                    const response = await cp.heartbeat(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for Heartbeat`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });

            client.on('MeterValues', async (request: ocpp.MeterValuesRequest, cb: (response: ocpp.MeterValuesResponse) => void) => {
                console.log(`Client ${cp.cpid} sent MeterValues`, request);
                if (!isMocking) {
                    try {
                        const response = await cp.meterValues(request);
                        console.log(`Response received from CSMS for ${cp.cpid} for MeterValues`, response);
                        cb(response);
                    }
                    catch (e) {
                        console.log(e);
                    }
                }
            });

            client.on('StartTransaction', async (request: ocpp.StartTransactionRequest, cb: (response: ocpp.StartTransactionResponse) => void) => {
                console.log(`Client ${cp.cpid} sent StartTransaction`, request);

                //we may have to mock the response from the CSMS
                if (nextStartIsMock) {
                    const response: ocpp.StartTransactionResponse = {
                        transactionId: 1,
                        idTagInfo: {
                            status: 'Accepted'
                        }
                    };
                    console.log(`[MOCK] Response received from CSMS for ${cp.cpid} for StartTransaction`, response);
                    cb(response);
                    startMeterValue = request.meterStart;
                    nextStartIsMock = false;
                    isMocking = true;
                    nextStopIsMock = true;
                    return;
                }

                try {
                    const response = await cp.startTransaction(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for StartTransaction`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });

            client.on('StatusNotification', async (request: ocpp.StatusNotificationRequest, cb: (response: ocpp.StatusNotificationResponse) => void) => {
                console.log(`Client ${cp.cpid} sent StatusNotification`, request);

                if (isMocking) {
                    const mock_status: ocpp.StatusNotificationRequest = {
                        connectorId: request.connectorId,
                        status: 'Faulted',
                        errorCode: 'EVCommunicationError',
                    };
                    cp.statusNotification(mock_status);
                    return;
                }

                try {
                    const response = await cp.statusNotification(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for StatusNotification`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });

            client.on('StopTransaction', async (request: ocpp.StopTransactionRequest, cb: (response: ocpp.StopTransactionResponse) => void) => {
                console.log(`Client ${cp.cpid} sent StopTransaction`, request);

                if (nextStopIsMock) {
                    const response: ocpp.StopTransactionResponse = {
                        idTagInfo: {
                            status: 'Accepted'
                        }
                    };
                    console.log(`[MOCK] Response received from CSMS for ${cp.cpid} for StopTransaction`, response);
                    cb(response);
                    isMocking = false;
                    nextStopIsMock = false;

                    //soft-reset the chargepoint
                    return;
                }

                try {
                    const response = await cp.stopTransaction(request);
                    console.log(`Response received from CSMS for ${cp.cpid} for StopTransaction`, response);
                    cb(response);
                }
                catch (e) {
                    console.log(e);
                }
            });
        });

        cp.on('close', () => {
            client.close();
            cp.removeAllListeners();
        });

    } catch (e) {
        console.log(e);
    }
});