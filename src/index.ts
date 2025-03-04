import { ChargePoint } from "./chargepoint";

import * as ocpp from './OcppTs';

const centralSystemSimple = new ocpp.OcppServer();

centralSystemSimple.listen(3000);
const connectedClients: Map<string, ChargePoint> = new Map();

const mockTagsStr = process.env.MOCK_TAGS;
const mockTags = mockTagsStr ? mockTagsStr.split(',') : [];

centralSystemSimple.on('connection', (client: ocpp.OcppClientConnection) => {
  try {
    let isMocking = false;
    let nextStartIsMock = false;
    let nextStopIsMock = false;
    let mockConnectorId = 0;
    let cachedBootNotification: ocpp.BootNotificationRequest | null = null;

    console.log(`Client ${client.getCpId()} connected`);

    if (connectedClients.has(client.getCpId())) {
      const cp = connectedClients.get(client.getCpId());
      if (!cp) {
        return;
      }
      cp.close();
      if (cp.isMocking) {
        isMocking = true;
        nextStopIsMock = true;
      }
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

    client.on('BootNotification', async (request: ocpp.BootNotificationRequest, cb: (response: ocpp.BootNotificationResponse) => void) => {
      cachedBootNotification = request;
      cb({
        status: "Accepted",
        currentTime: new Date().toISOString(),
        interval: 120,
      })
    });

    client.on('Authorize', async (request: ocpp.AuthorizeRequest, cb: (response: ocpp.AuthorizeResponse) => void) => {
      console.log(`Client ${cp.cpid} sent Authorize, tag id ${request.idTag}`);

      //we may have to mock the response from the CSMS
      if (mockTags.includes(request.idTag)) {
        const response: ocpp.AuthorizeResponse = {
          idTagInfo: {
            status: 'Accepted'
          }
        };
        console.log(`[MOCK] Authorized tag ${request.idTag}`);
        cb(response);
        nextStartIsMock = true;
        return;
      }

      try {
        const response = await cp.authorize(request);
        cb(response);
      }
      catch (e) {
        console.log(e);
      }
    });

    client.on('DataTransfer', async (request: ocpp.DataTransferRequest, cb: (response: ocpp.DataTransferResponse) => void) => {
      try {
        const response = await cp.dataTransfer(request);
        cb(response);
      }
      catch (e) {
        console.log(e);
      }
    });

    client.on('DiagnosticsStatusNotification', async (request: ocpp.DiagnosticsStatusNotificationRequest, cb: (response: ocpp.DiagnosticsStatusNotificationResponse) => void) => {
      try {
        const response = await cp.diagnosticsStatusNotification(request);
        cb(response);
      }
      catch (e) {
        console.log(e);
      }
    });

    client.on('FirmwareStatusNotification', async (request: ocpp.FirmwareStatusNotificationRequest, cb: (response: ocpp.FirmwareStatusNotificationResponse) => void) => {
      try {
        const response = await cp.firmwareStatusNotification(request);
        cb(response);
      }
      catch (e) {
        console.log(e);
      }
    });

    client.on('Heartbeat', async (request: ocpp.HeartbeatRequest, cb: (response: ocpp.HeartbeatResponse) => void) => {
      try {
        const response = await cp.heartbeat(request);
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
      } else {
        console.log(`[MOCK] Ignoring metervalues from ${cp.cpid}`);
      }
    });

    client.on('StartTransaction', async (request: ocpp.StartTransactionRequest, cb: (response: ocpp.StartTransactionResponse) => void) => {
      console.log(`Client ${cp.cpid} sent StartTransaction, start meter: ${request.meterStart}`);

      //we may have to mock the response from the CSMS
      if (nextStartIsMock) {
        const response: ocpp.StartTransactionResponse = {
          transactionId: 1,
          idTagInfo: {
            status: 'Accepted'
          }
        };
        console.log(`[MOCK] Accepted start of transaction`);
        cb(response);

        mockConnectorId = request.connectorId;
        nextStartIsMock = false;
        isMocking = true;
        cp.isMocking = true;
        nextStopIsMock = true;
        return;
      }

      try {
        const response = await cp.startTransaction(request);
        cb(response);
      }
      catch (e) {
        console.log(e);
      }
    });

    client.on('StatusNotification', async (request: ocpp.StatusNotificationRequest, cb: (response: ocpp.StatusNotificationResponse) => void) => {
      if (isMocking) {
        const mock_status: ocpp.StatusNotificationRequest = {
          connectorId: request.connectorId,
          status: 'Unavailable',
          errorCode: 'NoError',
          timestamp: new Date().toISOString()
        };
        cp.statusNotification(mock_status);
        console.log(`[MOCK] StatusNotification sent to CSMS for ${cp.cpid} with ${mock_status.status}:${mock_status.errorCode}`);
        return;
      }

      try {
        const response = await cp.statusNotification(request);
        cb(response);
      }
      catch (e) {
        console.log(e);
      }
    });

    client.on('StopTransaction', async (request: ocpp.StopTransactionRequest, cb: (response: ocpp.StopTransactionResponse) => void) => {
      console.log(`Client ${cp.cpid} sent StopTransaction, stop meter: ${request.meterStop}`);

      if (nextStopIsMock) {
        const response: ocpp.StopTransactionResponse = {
          idTagInfo: {
            status: 'Accepted'
          }
        };
        console.log(`[MOCK] Accepted stop of transaction`);
        cb(response);
        isMocking = false;
        cp.isMocking = false;
        nextStopIsMock = false;

        cp.statusNotification({
          connectorId: mockConnectorId,
          status: 'Available',
          errorCode: 'NoError',
          timestamp: new Date().toISOString()
        });

        //soft-reset the chargepoint
        cp.softReset();
        return;
      }

      try {
        const response = await cp.stopTransaction(request);
        cb(response);
      }
      catch (e) {
        console.log(e);
      }
    });

    cp.on('connect', async () => {
      //send BootNotification to CSMS
      if (cachedBootNotification) {
        try {
          await cp.bootNotification(cachedBootNotification);
        } catch (e) {
          console.log(e);
        }
      }
    });

    cp.on('close', () => {
      client.close();
      cp.removeAllListeners();
    });

  } catch (e) {
    console.log(e);
  }
});