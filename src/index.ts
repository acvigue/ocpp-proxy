import express, { Request, Response } from 'express';
import expressWs from 'express-ws';
import { ChargePointClient } from './types';

const { app, getWss, applyTo } = expressWs(express());

const port = process.env.PORT || 3000;

const chargePoints: ChargePointClient[] = [];

app.ws('/:url', (ws, req: Request) => {
    //get url parameter
    const url = req.params.url;
    if (!url) {
        ws.close();
        return;
    }

    const decodedURL = atob(url);
    if (!decodedURL || (decodedURL.indexOf('ws://') !== 0 && decodedURL.indexOf('wss://') !== 0)) {
        ws.close();
        return;
    }

    const chargePoint: ChargePointClient = {
        cpid: url,
        inbound_client: ws,
        outbound_client: new WebSocket(decodedURL)
    };

    chargePoint.outbound_client.onopen = () => {
        console.log('Connected to central station');
    };

    chargePoint.outbound_client.onclose = () => {
        if (chargePoint.inbound_client.readyState === 1) {
            console.log("Disconnected from central station, closing connection to charge point");
            chargePoint.inbound_client.close();
        }
    };

    chargePoint.outbound_client.onmessage = (event) => {
        console.log('Received message from central station: \n %s \n\n\n', JSON.parse(event.data));
        chargePoint.inbound_client.send(event.data);
    };

    chargePoint.inbound_client.on('message', (data) => {
        console.log('Received message from charge point: \n %s \n\n\n', JSON.parse(data.toString()));
        chargePoint.outbound_client.send(data.toString());
    });

    chargePoint.inbound_client.on('close', () => {
        if (chargePoint.outbound_client.readyState === 1) {
            console.log("Disconnected from charge point, closing connection to central station");
            chargePoint.outbound_client.close();
        }
    });

    chargePoints.push(chargePoint);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});