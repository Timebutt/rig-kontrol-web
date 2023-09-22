import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatSelectChange } from '@angular/material/select';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.less'],
})
export class AppComponent {
    readonly expressionPedalMinValue = 70;
    readonly expressionPedalMaxValue = 600;

    lastButtonBits: number = 0;
    lastExpressionPedalValue: number = 0;

    midiOutputDevices: WebMidi.MIDIOutput[] = [];
    midiOutputDevice: WebMidi.MIDIOutput | null = null;

    outputDeviceControl = new FormControl();
    midiChannelControl = new FormControl<number>(1);

    noteMidiOutputDevice: WebMidi.MIDIOutput | null = null;

    midiNoteMap: Record<number, number> = {
        0: 0,
        1: 1,
        2: 2,
        3: 3,
        4: 55,
        5: 51,
        6: 6,
        7: 7,
        8: 8,
    };

    constructor() {
        navigator.requestMIDIAccess().then((access) => {
            const midiOutputDevices = Array.from(access.outputs.values());

            if (midiOutputDevices.length > 0) {
                this.midiOutputDevices = midiOutputDevices;
                this.midiOutputDevice = midiOutputDevices[1];
                this.outputDeviceControl.setValue(this.midiOutputDevice);

                console.log(midiOutputDevices);

                for (const device of midiOutputDevices) {
                    if (device.name === 'Swissonic MidiConnect 2 Port 1') {
                        this.noteMidiOutputDevice = device;
                        console.log(device);
                    }
                }
            }
        });
    }

    selectOutputDevice(event: MatSelectChange) {
        if (event.value) {
            this.midiOutputDevice = event.value;
        }
    }

    convertExpressionPedalValue(value: number) {
        return Math.round(
            Math.max(
                Math.min(
                    ((value - this.expressionPedalMinValue) * 127) / (this.expressionPedalMaxValue - this.expressionPedalMinValue),
                    127
                ),
                0
            )
        );
    }

    isBitEnabled(input: number, bit: number) {
        return (input >> bit) % 2 != 0;
    }

    async getDevices() {
        const device = await navigator.usb
            .requestDevice({
                filters: [{ vendorId: 0x17cc }],
            })
            .catch(() => {
                // TO-DO: handle errors
            });

        if (!device) {
            return;
        }

        await device.open();
        await device.selectConfiguration(1);
        await device.claimInterface(0);

        while (true) {
            try {
                const result = await device.transferIn(1, 128);
                if (result.data && this.midiOutputDevice && this.midiChannelControl.value) {
                    if (result.data.byteLength === 8) {
                        const buttonBits = result.data.getInt8(1);

                        console.log('DATA BINNEN');

                        // Update switch values
                        for (let i = 0; i < 8; i++) {
                            if (this.isBitEnabled(this.lastButtonBits, i) !== this.isBitEnabled(buttonBits, i)) {
                                const outValue = Boolean(buttonBits >> i) ? 127 : 0;

                                switch (i) {
                                    case 0:
                                        this.midiOutputDevice.send([144 + 2, 54, outValue]);
                                        break;
                                    case 1:
                                        this.midiOutputDevice.send([144 + 2, 50, outValue]);
                                        break;
                                    case 2:
                                        this.midiOutputDevice.send([144 + 2, 56, outValue]);
                                        break;
                                    case 3:
                                        this.midiOutputDevice.send([144 + 2, 57, outValue]);
                                        break;
                                    case 4:
                                        this.midiOutputDevice.send([144 + 2, 55, outValue]);
                                        break;
                                    case 5:
                                        this.midiOutputDevice.send([144 + 2, 51, outValue]);
                                        this.midiOutputDevice.send([144 + 15, 1, outValue]);
                                        break;
                                }
                            }
                        }
                        this.lastButtonBits = buttonBits;
                    }

                    // Update expression pedal value
                    if (result.data.byteLength === 33) {
                        const expressionPedalValue = result.data.getInt16(5);
                        const mappedExpressionPedalValue = this.convertExpressionPedalValue(expressionPedalValue);
                        if (mappedExpressionPedalValue !== this.lastExpressionPedalValue) {
                            this.midiOutputDevice.send([176 + this.midiChannelControl.value - 1, 1, mappedExpressionPedalValue]);
                            this.lastExpressionPedalValue = mappedExpressionPedalValue;
                        }
                    }
                }
            } catch (error) {
                console.log(error);
            }
        }
    }

    startTune(tune: number) {
        if (this.noteMidiOutputDevice) {
            this.noteMidiOutputDevice.send([144 + 4, tune, 127]);
            this.noteMidiOutputDevice.send([144 + 4, tune, 0]);
        }
    }

    stopTune() {
        console.log(this.noteMidiOutputDevice);

        if (this.noteMidiOutputDevice) {
            console.log('jo');

            this.noteMidiOutputDevice.send([144 + 4, 11, 127]);
            this.noteMidiOutputDevice.send([144 + 11, 10, 0]);
        }
    }
}
