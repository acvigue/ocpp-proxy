import { EventEmitter } from "stream";
import * as ocpp from "./OcppTs";

export declare interface ChargePoint {
    on(event: 'connect', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
}

export class ChargePoint extends EventEmitter {
    private client: ocpp.OcppClient;
    public isMocking: boolean = false;
    public connected: boolean = false;

    constructor(public cpid: string, private csms_url: string, private real_client: ocpp.OcppClientConnection) {
        super();

        this.client = new ocpp.OcppClient(cpid);

        this.client.on('CancelReservation', async (request: ocpp.CancelReservationRequest, cb: (response: ocpp.CancelReservationResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent CancelReservation`, request);
                const response = await this.real_client.callRequest('CancelReservation', request);
                console.log(`Response received from EVSE ${cpid} for CancelReservation`, response);
                cb(response);
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('ChangeAvailability', (request: ocpp.ChangeAvailabilityRequest, cb: (response: ocpp.ChangeAvailabilityResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent ChangeAvailability`, request);
                this.real_client.callRequest('ChangeAvailability', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for ChangeAvailability`, response);
                    cb(response);
                });
            }
            catch (e) {
                console.log(e);
            }
        });

        this.client.on('ChangeConfiguration', (request: ocpp.ChangeConfigurationRequest, cb: (response: ocpp.ChangeConfigurationResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent ChangeConfiguration`, request);

                const oldRequest = JSON.stringify(request);
                const newRequest = oldRequest.replace("ocpp.io", "evcms.me");
                const newConfig = JSON.parse(newRequest);

                this.real_client.callRequest('ChangeConfiguration', newConfig).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for ChangeConfiguration`, response);
                    cb(response);
                });

                cb({
                    status: "Accepted"
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('ClearCache', (request: ocpp.ClearCacheRequest, cb: (response: ocpp.ClearCacheResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent ClearCache`, request);
                this.real_client.callRequest('ClearCache', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for ClearCache`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('ClearChargingProfile', (request: ocpp.ClearChargingProfileRequest, cb: (response: ocpp.ClearChargingProfileResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent ClearChargingProfile`, request);
                this.real_client.callRequest('ClearChargingProfile', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for ClearChargingProfile`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('DataTransfer', (request: ocpp.DataTransferRequest, cb: (response: ocpp.DataTransferResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent DataTransfer`, request);
                this.real_client.callRequest('DataTransfer', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for DataTransfer`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('GetCompositeSchedule', (request: ocpp.GetCompositeScheduleRequest, cb: (response: ocpp.GetCompositeScheduleResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent GetCompositeSchedule`, request);
                this.real_client.callRequest('GetCompositeSchedule', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for GetCompositeSchedule`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('GetConfiguration', (request: ocpp.GetConfigurationRequest, cb: (response: ocpp.GetConfigurationResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent GetConfiguration`, request);
                this.real_client.callRequest('GetConfiguration', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for GetConfiguration`, response);

                    const config = JSON.stringify(response);
                    const newConfig = config.replace("evcms.me", "ocpp.io");
                    const newResponse = JSON.parse(newConfig);
                    cb(newResponse as ocpp.GetConfigurationResponse);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('GetDiagnostics', (request: ocpp.GetDiagnosticsRequest, cb: (response: ocpp.GetDiagnosticsResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent GetDiagnostics`, request);
                this.real_client.callRequest('GetDiagnostics', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for GetDiagnostics`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('GetLocalListVersion', (request: ocpp.GetLocalListVersionRequest, cb: (response: ocpp.GetLocalListVersionResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent GetLocalListVersion`, request);
                this.real_client.callRequest('GetLocalListVersion', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for GetLocalListVersion`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('RemoteStartTransaction', (request: ocpp.RemoteStartTransactionRequest, cb: (response: ocpp.RemoteStartTransactionResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent RemoteStartTransaction`, request);
                if (this.isMocking) {
                    cb({
                        status: "Rejected"
                    });
                    return;
                }
                this.real_client.callRequest('RemoteStartTransaction', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for RemoteStartTransaction`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('RemoteStopTransaction', (request: ocpp.RemoteStopTransactionRequest, cb: (response: ocpp.RemoteStopTransactionResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent RemoteStopTransaction`, request);
                if (this.isMocking) {
                    cb({
                        status: "Rejected"
                    });
                    return;
                }
                this.real_client.callRequest('RemoteStopTransaction', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for RemoteStopTransaction`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('ReserveNow', (request: ocpp.ReserveNowRequest, cb: (response: ocpp.ReserveNowResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent ReserveNow`, request);
                this.real_client.callRequest('ReserveNow', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for ReserveNow`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('Reset', (request: ocpp.ResetRequest, cb: (response: ocpp.ResetResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent Reset`, request);
                if (this.isMocking) {
                    cb({
                        status: "Rejected"
                    });
                    return;
                }
                this.real_client.callRequest('Reset', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for Reset`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('SendLocalList', (request: ocpp.SendLocalListRequest, cb: (response: ocpp.SendLocalListResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent SendLocalList`, request);
                this.real_client.callRequest('SendLocalList', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for SendLocalList`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('SetChargingProfile', (request: ocpp.SetChargingProfileRequest, cb: (response: ocpp.SetChargingProfileResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent SetChargingProfile`, request);
                this.real_client.callRequest('SetChargingProfile', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for SetChargingProfile`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('TriggerMessage', (request: ocpp.TriggerMessageRequest, cb: (response: ocpp.TriggerMessageResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent TriggerMessage`, request);
                if (this.isMocking) {
                    switch (request.requestedMessage) {
                        case "BootNotification":
                            this.real_client.callRequest('TriggerMessage', request).then((response) => {
                                console.log(`Response received from EVSE ${cpid} for TriggerMessage`, response);
                                cb(response);
                            });
                            return;
                        case "Heartbeat":
                            this.real_client.callRequest('TriggerMessage', request).then((response) => {
                                console.log(`Response received from EVSE ${cpid} for TriggerMessage`, response);
                                cb(response);
                            });
                            return;
                        case "StatusNotification":
                            this.client.callRequest('StatusNotification', {
                                connectorId: 1,
                                errorCode: 'NoError',
                                status: "Unavailable"
                            });
                            cb({
                                status: "Accepted"
                            });
                            return;
                        case "MeterValues":
                            cb({
                                status: "Accepted"
                            });
                            return;
                    }
                }

                this.real_client.callRequest('TriggerMessage', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for TriggerMessage`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('UnlockConnector', (request: ocpp.UnlockConnectorRequest, cb: (response: ocpp.UnlockConnectorResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent UnlockConnector`, request);
                this.real_client.callRequest('UnlockConnector', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for UnlockConnector`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('UpdateFirmware', (request: ocpp.UpdateFirmwareRequest, cb: (response: ocpp.UpdateFirmwareResponse) => void) => {
            try {
                console.log(`CSMS (for ${cpid}) sent UpdateFirmware`, request);
                this.real_client.callRequest('UpdateFirmware', request).then((response) => {
                    console.log(`Response received from EVSE ${cpid} for UpdateFirmware`, response);
                    cb(response);
                });
            } catch (e) {
                console.log(e);
            }
        });

        this.client.on('connect', () => {
            this.connected = true;
            this.emit('connect');
        });

        this.client.on('close', () => {
            this.connected = false;
            this.emit('close');
        });

        this.client.connect(this.csms_url);
    }

    async authorize(payload: ocpp.AuthorizeRequest): Promise<ocpp.AuthorizeResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("Authorize", payload);
    }

    async bootNotification(payload: ocpp.BootNotificationRequest): Promise<ocpp.BootNotificationResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("BootNotification", payload);
    }

    async dataTransfer(payload: ocpp.DataTransferRequest): Promise<ocpp.DataTransferResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("DataTransfer", payload);
    }

    async diagnosticsStatusNotification(payload: ocpp.DiagnosticsStatusNotificationRequest): Promise<ocpp.DiagnosticsStatusNotificationResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("DiagnosticsStatusNotification", payload);
    }

    async firmwareStatusNotification(payload: ocpp.FirmwareStatusNotificationRequest): Promise<ocpp.FirmwareStatusNotificationResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("FirmwareStatusNotification", payload);
    }

    async heartbeat(payload: ocpp.HeartbeatRequest): Promise<ocpp.HeartbeatResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("Heartbeat", payload);
    }

    async meterValues(payload: ocpp.MeterValuesRequest): Promise<ocpp.MeterValuesResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("MeterValues", payload);
    }

    async startTransaction(payload: ocpp.StartTransactionRequest): Promise<ocpp.StartTransactionResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("StartTransaction", payload);
    }

    async statusNotification(payload: ocpp.StatusNotificationRequest): Promise<ocpp.StatusNotificationResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("StatusNotification", payload);
    }

    async stopTransaction(payload: ocpp.StopTransactionRequest): Promise<ocpp.StopTransactionResponse> {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }
        return this.client.callRequest("StopTransaction", payload);
    }

    async softReset() {
        if (!this.connected) {
            throw new Error("Not connected to CSMS");
        }

        return this.real_client.callRequest("Reset", {
            type: "Hard"
        });
    }

    async close(code?: number, reason?: Buffer) {
        this.client.close(code, reason);
        this.emit('close', code, reason);
    }
}