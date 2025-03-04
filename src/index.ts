import express, { Request, Response } from 'express';
import expressWs from 'express-ws';
import { RawData, WebSocket as WSClient } from 'ws';
import { ChargePointClient } from './types';

const { app, getWss, applyTo } = expressWs(express());

const port = process.env.PORT || 3000;

const chargePoints: ChargePointClient[] = [];

app.ws('/:url/:cpid', (ws: WSClient, req: Request) => {
    //get url parameter
    const url = req.params.url;
    if (!url) {
        ws.close();
        return;
    }

    //get cpid parameter
    const cpid = req.params.cpid;
    if (!cpid) {
        ws.close();
        return;
    }

    const chargePoint: ChargePointClient = {
        cpid,
        inbound_client: ws,
        outbound_client: new WebSocket(`wss://${decodeURIComponent(url)}/${cpid}`),
        is_mocking: false
    };

    chargePoint.outbound_client.onclose = () => {
        if (chargePoint.inbound_client.readyState === 1) {
            chargePoint.inbound_client.close();
        }
    };

    chargePoint.inbound_client.on('close', () => {
        if (chargePoint.outbound_client.readyState === 1) {
            console.log("Disconnected from charge point, closing connection to central station");
            chargePoint.outbound_client.close();
        }
    });

    chargePoint.outbound_client.onmessage = (event) => {
        console.log('Received message from central station: \n %s \n\n\n', JSON.parse(event.data));
        chargePoint.inbound_client.send(event.data);
    };

    chargePoint.inbound_client.on('message', (data: RawData) => {
        console.log('Received message from charge point: \n %s \n\n\n', JSON.parse(data.toString()));
        chargePoint.outbound_client.send(data.toString());
    });

    chargePoint.inbound_client.on('error', (error) => {
        console.log('Error occurred in charge point connection: %s', error);
        chargePoint.outbound_client.close();
        chargePoint.inbound_client.close();
    });

    chargePoint.outbound_client.onerror = (error) => {
        console.log('Error occurred in central station connection: %s', error);
        chargePoint.outbound_client.close();
        chargePoint.inbound_client.close();
    };

    chargePoints.push(chargePoint);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});