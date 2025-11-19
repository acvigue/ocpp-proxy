import { ChargePoint } from "./chargepoint";
import { createClient } from 'redis';

import * as ocpp from './OcppTs';

const centralSystemSimple = new ocpp.OcppServer();

const redis = createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 1000), // Exponential backoff with max 1s
    connectTimeout: 5000
  }
});

// Add Redis error handlers to prevent crashes
redis.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
  // Don't crash the server on Redis errors
});

redis.on('connect', () => {
  console.log('Redis client connected');
});

redis.on('ready', () => {
  console.log('Redis client ready');
});

redis.on('end', () => {
  console.log('Redis client disconnected');
});

redis.on('reconnecting', () => {
  console.log('Redis client reconnecting...');
});

// Graceful Redis connection with retry logic
const connectRedis = async (retries = 5): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      await redis.connect();
      console.log('Connected to Redis');
      centralSystemSimple.listen(3000);
      return;
    } catch (e) {
      console.error(`Redis connection attempt ${i + 1} failed:`, e instanceof Error ? e.message : e);
      if (i === retries - 1) {
        console.error('Failed to connect to Redis after maximum retries. Starting server without Redis...');
        centralSystemSimple.listen(3000);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
};

connectRedis().catch((e) => {
  console.error('Critical error during Redis connection:', e);
  // Start server anyway to maintain availability
  centralSystemSimple.listen(3000);
});

const connectedClients: Map<string, ChargePoint> = new Map();

const mockTagsStr = process.env.MOCK_TAGS;
const mockTags = mockTagsStr ? mockTagsStr.split(',') : [];

// Safe Redis operations to prevent crashes
const safeRedisGet = async (key: string): Promise<string | null> => {
  try {
    if (!redis.isReady) {
      console.warn(`Redis not ready, skipping GET for key: ${key}`);
      return null;
    }
    return await redis.get(key);
  } catch (error) {
    console.error(`Redis GET error for key ${key}:`, error instanceof Error ? error.message : error);
    return null;
  }
};

const safeRedisSet = async (key: string, value: string): Promise<boolean> => {
  try {
    if (!redis.isReady) {
      console.warn(`Redis not ready, skipping SET for key: ${key}`);
      return false;
    }
    await redis.set(key, value);
    return true;
  } catch (error) {
    console.error(`Redis SET error for key ${key}:`, error instanceof Error ? error.message : error);
    return false;
  }
};

// Cleanup function for charge point disconnection
const cleanupChargePoint = (cpid: string) => {
  try {
    const cp = connectedClients.get(cpid);
    if (cp) {
      try {
        cp.close();
      } catch (error) {
        console.error(`Error closing charge point ${cpid}:`, error instanceof Error ? error.message : error);
      }
      connectedClients.delete(cpid);
      console.log(`Cleaned up charge point: ${cpid}`);
    }
  } catch (error) {
    console.error(`Error during cleanup for ${cpid}:`, error instanceof Error ? error.message : error);
  }
};

centralSystemSimple.on('connection', async (client: ocpp.OcppClientConnection) => {
  let cp: ChargePoint | null = null;

  try {
    const cpId = client.getCpId();
    if (!cpId) {
      console.error('Client connected without valid CP ID');
      client.close();
      return;
    }

    console.log(`Client ${cpId} connected`);

    // Handle existing connection cleanup
    if (connectedClients.has(cpId)) {
      console.log(`Existing connection found for ${cpId}, cleaning up...`);
      cleanupChargePoint(cpId);
    }

    // Create new charge point with error handling
    try {
      cp = new ChargePoint(cpId, `wss://ocpp.io/`, client);
      connectedClients.set(cpId, cp);
    } catch (error) {
      console.error(`Failed to create ChargePoint for ${cpId}:`, error instanceof Error ? error.message : error);
      client.close();
      return;
    }

    // Enhanced client close handler
    client.on('close', (code: number, reason: Buffer) => {
      try {
        console.log(`Client ${cpId} disconnected with code ${code}`);
        if (cp) {
          cp.close();
          cp.removeAllListeners();
        }
        connectedClients.delete(cpId);
      } catch (error) {
        console.error(`Error handling client close for ${cpId}:`, error instanceof Error ? error.message : error);
      }
    });

    // Add error handler for client
    client.on('error', (error: Error) => {
      console.error(`Client error for ${cpId}:`, error.message);
      cleanupChargePoint(cpId);
    });

    client.on('BootNotification', async (request: ocpp.BootNotificationRequest, cb: (response: ocpp.BootNotificationResponse) => void) => {
      if (!cp) {
        console.error('BootNotification received but ChargePoint is null');
        cb({
          status: "Rejected",
          currentTime: new Date().toISOString(),
          interval: 120,
        });
        return;
      }

      try {
        if (!cp.connected) {
          await safeRedisSet(`${cp.cpid}/cachedBootNotification`, JSON.stringify(request));
          cb({
            status: "Accepted",
            currentTime: new Date().toISOString(),
            interval: 120,
          });
          return;
        }

        const response = await cp.bootNotification(request);
        cb(response);
      } catch (e) {
        console.error(`BootNotification error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({
          status: "Rejected",
          currentTime: new Date().toISOString(),
          interval: 120,
        });
      }
    });

    client.on('Authorize', async (request: ocpp.AuthorizeRequest, cb: (response: ocpp.AuthorizeResponse) => void) => {
      if (!cp) {
        console.error('Authorize received but ChargePoint is null');
        cb({
          idTagInfo: {
            status: 'Invalid'
          }
        });
        return;
      }

      try {
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

          await safeRedisSet(`${cp.cpid}/nextStartIsMock`, 'true');
          return;
        }

        const response = await cp.authorize(request);
        cb(response);
      }
      catch (e) {
        console.error(`Authorize error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({
          idTagInfo: {
            status: 'Invalid'
          }
        });
      }
    });

    client.on('DataTransfer', async (request: ocpp.DataTransferRequest, cb: (response: ocpp.DataTransferResponse) => void) => {
      if (!cp) {
        console.error('DataTransfer received but ChargePoint is null');
        cb({ status: 'Rejected' });
        return;
      }

      try {
        const response = await cp.dataTransfer(request);
        cb(response);
      }
      catch (e) {
        console.error(`DataTransfer error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({ status: 'Rejected' });
      }
    });

    client.on('DiagnosticsStatusNotification', async (request: ocpp.DiagnosticsStatusNotificationRequest, cb: (response: ocpp.DiagnosticsStatusNotificationResponse) => void) => {
      if (!cp) {
        console.error('DiagnosticsStatusNotification received but ChargePoint is null');
        cb({});
        return;
      }

      try {
        const response = await cp.diagnosticsStatusNotification(request);
        cb(response);
      }
      catch (e) {
        console.error(`DiagnosticsStatusNotification error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({});
      }
    });

    client.on('FirmwareStatusNotification', async (request: ocpp.FirmwareStatusNotificationRequest, cb: (response: ocpp.FirmwareStatusNotificationResponse) => void) => {
      if (!cp) {
        console.error('FirmwareStatusNotification received but ChargePoint is null');
        cb({});
        return;
      }

      try {
        const response = await cp.firmwareStatusNotification(request);
        cb(response);
      }
      catch (e) {
        console.error(`FirmwareStatusNotification error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({});
      }
    });

    client.on('Heartbeat', async (request: ocpp.HeartbeatRequest, cb: (response: ocpp.HeartbeatResponse) => void) => {
      if (!cp) {
        console.error('Heartbeat received but ChargePoint is null');
        cb({ currentTime: new Date().toISOString() });
        return;
      }

      try {
        const response = await cp.heartbeat(request);
        cb(response);
      }
      catch (e) {
        console.error(`Heartbeat error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({ currentTime: new Date().toISOString() });
      }
    });

    client.on('MeterValues', async (request: ocpp.MeterValuesRequest, cb: (response: ocpp.MeterValuesResponse) => void) => {
      if (!cp) {
        console.error('MeterValues received but ChargePoint is null');
        cb({});
        return;
      }

      try {
        console.log(`Client ${cp.cpid} sent MeterValues`, request);
        const isMocking = await safeRedisGet(`${cp.cpid}/isMocking`) === 'true';
        if (!isMocking) {
          const response = await cp.meterValues(request);
          console.log(`Response received from CSMS for ${cp.cpid} for MeterValues`, response);
          cb(response);
        } else {
          console.log(`[MOCK] Ignoring metervalues from ${cp.cpid}`);
          cb({});
        }
      }
      catch (e) {
        console.error(`MeterValues error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({});
      }
    });

    client.on('StartTransaction', async (request: ocpp.StartTransactionRequest, cb: (response: ocpp.StartTransactionResponse) => void) => {
      if (!cp) {
        console.error('StartTransaction received but ChargePoint is null');
        cb({
          transactionId: -1,
          idTagInfo: {
            status: 'Invalid'
          }
        });
        return;
      }

      try {
        console.log(`Client ${cp.cpid} sent StartTransaction, start meter: ${request.meterStart}`);
        const nextStartIsMock = await safeRedisGet(`${cp.cpid}/nextStartIsMock`) === 'true';
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

          await safeRedisSet(`${cp.cpid}/mockConnectorId`, request.connectorId.toString());
          await safeRedisSet(`${cp.cpid}/nextStartIsMock`, 'false');
          await safeRedisSet(`${cp.cpid}/isMocking`, 'true');
          await safeRedisSet(`${cp.cpid}/nextStopIsMock`, 'true');
          return;
        }

        const response = await cp.startTransaction(request);
        cb(response);
      }
      catch (e) {
        console.error(`StartTransaction error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({
          transactionId: -1,
          idTagInfo: {
            status: 'Invalid'
          }
        });
      }
    });

    client.on('StatusNotification', async (request: ocpp.StatusNotificationRequest, cb: (response: ocpp.StatusNotificationResponse) => void) => {
      if (!cp) {
        console.error('StatusNotification received but ChargePoint is null');
        cb({});
        return;
      }

      try {
        const isMocking = await safeRedisGet(`${cp.cpid}/isMocking`) === 'true';
        if (isMocking) {
          const mock_status: ocpp.StatusNotificationRequest = {
            connectorId: request.connectorId,
            status: 'Unavailable',
            errorCode: 'NoError',
            timestamp: new Date().toISOString()
          };
          cp.statusNotification(mock_status);
          console.log(`[MOCK] StatusNotification sent to CSMS for ${cp.cpid} with ${mock_status.status}:${mock_status.errorCode}`);
          cb({});
          return;
        }

        const response = await cp.statusNotification(request);
        cb(response);
      }
      catch (e) {
        console.error(`StatusNotification error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({});
      }
    });

    client.on('StopTransaction', async (request: ocpp.StopTransactionRequest, cb: (response: ocpp.StopTransactionResponse) => void) => {
      if (!cp) {
        console.error('StopTransaction received but ChargePoint is null');
        cb({
          idTagInfo: {
            status: 'Invalid'
          }
        });
        return;
      }

      try {
        console.log(`Client ${cp.cpid} sent StopTransaction, stop meter: ${request.meterStop}`);
        const nextStopIsMock = await safeRedisGet(`${cp.cpid}/nextStopIsMock`) === 'true';

        if (nextStopIsMock) {
          const response: ocpp.StopTransactionResponse = {
            idTagInfo: {
              status: 'Accepted'
            }
          };
          console.log(`[MOCK] Accepted stop of transaction`);
          cb(response);
          cp.isMocking = false;

          await safeRedisSet(`${cp.cpid}/isMocking`, 'false');
          await safeRedisSet(`${cp.cpid}/nextStopIsMock`, 'false');
          const mockConnectorIdStr = await safeRedisGet(`${cp.cpid}/mockConnectorId`);
          const mockConnectorId = parseInt(mockConnectorIdStr || '0');

          setTimeout(() => {
            if (cp && !cp.connected) return; // Safety check
            try {
              client.callRequest('TriggerMessage', {
                requestedMessage: 'StatusNotification',
                connectorId: mockConnectorId
              });
            } catch (error) {
              console.error(`Error sending TriggerMessage for ${cp?.cpid}:`, error instanceof Error ? error.message : error);
            }
          }, 5000);

          setTimeout(() => {
            if (cp && !cp.connected) return; // Safety check
            try {
              client.callRequest('TriggerMessage', {
                requestedMessage: 'StatusNotification',
                connectorId: mockConnectorId
              });
            } catch (error) {
              console.error(`Error sending delayed TriggerMessage for ${cp?.cpid}:`, error instanceof Error ? error.message : error);
            }
          }, 15000);
          return;
        }

        const response = await cp.stopTransaction(request);
        cb(response);
      }
      catch (e) {
        console.error(`StopTransaction error for ${cp.cpid}:`, e instanceof Error ? e.message : e);
        cb({
          idTagInfo: {
            status: 'Invalid'
          }
        });
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