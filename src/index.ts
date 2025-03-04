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
        outbound_client: new WSClient(`wss://${decodeURIComponent(url)}/${cpid}`),
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
        const eventString = event.data.toString();
        try {
            const payload = JSON.parse(eventString);
            console.log('Received message from central station: \n');
            console.log(payload);
            console.log('\n\n\n');
            chargePoint.inbound_client.send(event.data);
        } catch (error) {
            console.error('Error occurred while parsing message from central station', error);
        }
    };

    chargePoint.inbound_client.on('message', (data: RawData) => {
        const eventString = data.toString();
        try {
            const payload = JSON.parse(eventString);
            console.log('Received message from charge point: \n');
            console.log(payload);
            console.log('\n\n\n');
            chargePoint.outbound_client.send(data);
        } catch (error) {
            console.error('Error occurred while parsing message from charge point', error);
        }
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