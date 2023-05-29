import { Component } from '@angular/core';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.less'],
})
export class AppComponent {
    readonly expressionPedalMinValue = 70;
    readonly expressionPedalMaxValue = 600;

    midiChannel = 1;
    lastButtonBits: number = 0;
    lastExpressionPedalValue: number = 0;

    midiOutputDevices: WebMidi.MIDIOutput[] = [];
    midiOutputDevice: WebMidi.MIDIOutput | null = null;

    constructor() {
        navigator.requestMIDIAccess().then((access) => {
            const midiOutputDevices = Array.from(access.outputs.values());

            if (midiOutputDevices.length > 0) {
                this.midiOutputDevices = midiOutputDevices;
                this.midiOutputDevice = midiOutputDevices[1];
            }
        });
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
        const device = await navigator.usb.requestDevice({
            filters: [{ vendorId: 0x17cc }],
        });

        await device.open();
        await device.selectConfiguration(1);
        await device.claimInterface(0);

        while (true) {
            const result = await device.transferIn(1, 128);

            if (result.data && this.midiOutputDevice) {
                if (result.data.byteLength === 8) {
                    const buttonBits = result.data.getInt8(1);

                    // Update switch values
                    for (let i = 0; i < 8; i++) {
                        if (this.isBitEnabled(this.lastButtonBits, i) !== this.isBitEnabled(buttonBits, i)) {
                            if (Boolean(buttonBits >> i)) {
                                this.midiOutputDevice.send([144 + this.midiChannel - 1, i, 127]);
                            } else {
                                this.midiOutputDevice.send([144 + this.midiChannel - 1, i, 0]);
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
                        this.midiOutputDevice.send([176 + this.midiChannel - 1, 1, mappedExpressionPedalValue]);
                        this.lastExpressionPedalValue = mappedExpressionPedalValue;
                    }
                }
            }
        }
    }
}
