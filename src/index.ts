import { ChargePoint } from "./chargepoint";
import { createClient } from 'redis';

import * as ocpp from './OcppTs';

const centralSystemSimple = new ocpp.OcppServer();

const redis = createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

redis.connect().then(() => {
  console.log('Connected to Redis');
  centralSystemSimple.listen(3000);
}).catch((e) => {
  console.log('Error connecting to Redis', e);
});

const connectedClients: Map<string, ChargePoint> = new Map();

const mockTagsStr = process.env.MOCK_TAGS;
const mockTags = mockTagsStr ? mockTagsStr.split(',') : [];

centralSystemSimple.on('connection', async (client: ocpp.OcppClientConnection) => {
  try {
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

    client.on('BootNotification', async (request: ocpp.BootNotificationRequest, cb: (response: ocpp.BootNotificationResponse) => void) => {
      if (!cp.connected) {
        await redis.set(`${cp.cpid}/cachedBootNotification`, JSON.stringify(request));
        cb({
          status: "Accepted",
          currentTime: new Date().toISOString(),
          interval: 120,
        })
        return;
      }

      try {
        const response = await cp.bootNotification(request);
        cb(response);
      } catch (e) {
        console.log(e);
      }
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

        await redis.set(`${cp.cpid}/nextStartIsMock`, 'true');
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
      const isMocking = await redis.get(`${cp.cpid}/isMocking`) === 'true';
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
      const nextStartIsMock = await redis.get(`${cp.cpid}/nextStartIsMock`) === 'true';
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

        cp.isMocking = true;

        await redis.set(`${cp.cpid}/mockConnectorId`, request.connectorId.toString());
        await redis.set(`${cp.cpid}/nextStartIsMock`, 'false');
        await redis.set(`${cp.cpid}/isMocking`, 'true');
        await redis.set(`${cp.cpid}/nextStopIsMock`, 'true');
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
      const isMocking = await redis.get(`${cp.cpid}/isMocking`) === 'true';
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
      const nextStopIsMock = await redis.get(`${cp.cpid}/nextStopIsMock`) === 'true';

      if (nextStopIsMock) {
        const response: ocpp.StopTransactionResponse = {
          idTagInfo: {
            status: 'Accepted'
          }
        };
        console.log(`[MOCK] Accepted stop of transaction`);
        cb(response);
        cp.isMocking = false;

        await redis.set(`${cp.cpid}/isMocking`, 'false');
        await redis.set(`${cp.cpid}/nextStopIsMock`, 'false');
        const mockConnectorId = parseInt(await redis.get(`${cp.cpid}/mockConnectorId`) || '0');

        setTimeout(() => {
          client.callRequest('TriggerMessage', {
            requestedMessage: 'StatusNotification',
            connectorId: mockConnectorId
          });
        }, 5000);

        setTimeout(() => {
          client.callRequest('TriggerMessage', {
            requestedMessage: 'StatusNotification',
            connectorId: mockConnectorId
          });
        }, 15000);
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
      const cachedBootNotification = JSON.parse(await redis.get(`${cp.cpid}/cachedBootNotification`) || '{}');

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