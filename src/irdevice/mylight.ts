/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * light.ts: @switchbot/homebridge-switchbot.
 */
import { irdeviceBase } from './irdevice.js';

import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { debounceTime, Subject, tap } from 'rxjs';
import type { SwitchBotPlatform } from '../platform.js';
import type { irDevicesConfig } from '../settings.js';
import type { irdevice } from '../types/irdevicelist.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Light extends irdeviceBase {
  // Services
  private LightBulb?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
    Brightness: CharacteristicValue;
  };

  private ProgrammableSwitchOn?: {
    Name: CharacteristicValue;
    Service: Service;
    ProgrammableSwitchEvent: CharacteristicValue;
    ProgrammableSwitchOutputState: CharacteristicValue;
  };

  private ProgrammableSwitchOff?: {
    Name: CharacteristicValue;
    Service: Service;
    ProgrammableSwitchEvent: CharacteristicValue;
    ProgrammableSwitchOutputState: CharacteristicValue;
  };

  ceilingLightUpdateInProgress!: boolean;
  doCeilingLightUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);
    // Set category
    accessory.category = this.hap.Categories.LIGHTBULB;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doCeilingLightUpdate = new Subject();
    this.ceilingLightUpdateInProgress = false;

    if (!device.irlight?.stateless) {
      // Initialize LightBulb Service
      accessory.context.LightBulb = accessory.context.LightBulb ?? {};
      this.LightBulb = {
        Name: accessory.displayName,
        Service:
          accessory.getService(this.hap.Service.Lightbulb) ??
          (accessory.addService(this.hap.Service.Lightbulb) as Service),
        On: accessory.context.On || false,
        Brightness: accessory.context.Brightness ?? 0,
      };
      accessory.context.LightBulb = this.LightBulb as object;

      // Initialize LightBulb Characteristics
      this.LightBulb.Service.setCharacteristic(
        this.hap.Characteristic.Name,
        this.LightBulb.Name,
      )
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(() => {
          return this.LightBulb!.On;
        });
      // .onSet(this.OnSet.bind(this));

      // initialize Brightness
      this.LightBulb.Service.getCharacteristic(
        this.hap.Characteristic.Brightness,
      )
        .setProps({
          minStep: 1,
          minValue: 0,
          maxValue: 100,
          validValueRanges: [0, 100],
        })
        .onGet(() => {
          return this.LightBulb!.Brightness;
        })
        .onSet(this.BrightnessSet.bind(this));

      // Watch for Bulb change events
      // We put in a debounce of 100ms so we don't make duplicate calls
      this.doCeilingLightUpdate
        .pipe(
          tap(() => {
            this.ceilingLightUpdateInProgress = true;
          }),
          debounceTime(1000),
        )
        .subscribe(async () => {
          try {
            if (this.LightBulb!.On) {
              await this.pushBrightnessChanges();
            } else {
              await this.pushLightOffChanges(false);
            }
          } catch (e: any) {
            await this.apiError(e);
            await this.errorLog(
              `failed pushChanges with ${device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`,
            );
          }
          this.ceilingLightUpdateInProgress = false;
        });
    } else {
      // Initialize ProgrammableSwitchOn Service
      accessory.context.ProgrammableSwitchOn =
        accessory.context.ProgrammableSwitchOn ?? {};
      this.ProgrammableSwitchOn = {
        Name: `${accessory.displayName} On`,
        Service:
          accessory.getService(this.hap.Service.StatefulProgrammableSwitch) ??
          (accessory.addService(
            this.hap.Service.StatefulProgrammableSwitch,
          ) as Service),
        ProgrammableSwitchEvent:
          accessory.context.ProgrammableSwitchEvent ??
          this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
        ProgrammableSwitchOutputState:
          accessory.context.ProgrammableSwitchOutputState ?? 0,
      };
      accessory.context.ProgrammableSwitchOn = this
        .ProgrammableSwitchOn as object;

      // Initialize ProgrammableSwitchOn Characteristics
      this.ProgrammableSwitchOn?.Service.setCharacteristic(
        this.hap.Characteristic.Name,
        this.ProgrammableSwitchOn.Name,
      )
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent)
        .setProps({
          validValueRanges: [0, 0],
          minValue: 0,
          maxValue: 0,
          validValues: [0],
        })
        .onGet(() => {
          return this.ProgrammableSwitchOn!.ProgrammableSwitchEvent;
        });

      this.ProgrammableSwitchOn?.Service.getCharacteristic(
        this.hap.Characteristic.ProgrammableSwitchOutputState,
      )
        .onGet(() => {
          return this.ProgrammableSwitchOn!.ProgrammableSwitchOutputState;
        })
        .onSet(this.ProgrammableSwitchOutputStateSetOn.bind(this));

      // Initialize ProgrammableSwitchOff Service
      accessory.context.ProgrammableSwitchOff =
        accessory.context.ProgrammableSwitchOff ?? {};
      this.ProgrammableSwitchOff = {
        Name: `${accessory.displayName} Off`,
        Service:
          accessory.getService(this.hap.Service.StatefulProgrammableSwitch) ??
          (accessory.addService(
            this.hap.Service.StatefulProgrammableSwitch,
          ) as Service),
        ProgrammableSwitchEvent:
          accessory.context.ProgrammableSwitchEvent ??
          this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
        ProgrammableSwitchOutputState:
          accessory.context.ProgrammableSwitchOutputState ?? 0,
      };
      accessory.context.ProgrammableSwitchOff = this
        .ProgrammableSwitchOff as object;

      // Initialize ProgrammableSwitchOff Characteristics
      this.ProgrammableSwitchOff?.Service.setCharacteristic(
        this.hap.Characteristic.Name,
        this.ProgrammableSwitchOff.Name,
      )
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent)
        .setProps({
          validValueRanges: [0, 0],
          minValue: 0,
          maxValue: 0,
          validValues: [0],
        })
        .onGet(() => {
          return this.ProgrammableSwitchOff!.ProgrammableSwitchEvent;
        });

      this.ProgrammableSwitchOff?.Service.getCharacteristic(
        this.hap.Characteristic.ProgrammableSwitchOutputState,
      )
        .onGet(() => {
          return this.ProgrammableSwitchOff!.ProgrammableSwitchOutputState;
        })
        .onSet(this.ProgrammableSwitchOutputStateSetOff.bind(this));
    }
  }

  async OnSet(value: CharacteristicValue): Promise<void> {
    await this.debugLog(`On: ${value}`);

    this.LightBulb!.On = value;
    if (this.LightBulb?.On) {
      const On = true;
      await this.pushLightOnChanges(On);
    } else {
      const On = false;
      await this.pushLightOffChanges(On);
    }
    /**
     * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
     * they are updated, so we are only updating the accessory state after calling the above.
     */
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb!.On) {
      await this.infoLog(`Set Brightness: ${value}`);
    } else {
      this.debugLog(`Set Brightness: ${value}, On: ${this.LightBulb!.On}`);
    }
    this.LightBulb!.Brightness = value;
    this.LightBulb!.On = value !== 0;
    this.doCeilingLightUpdate.next();
  }

  async ProgrammableSwitchOutputStateSetOn(
    value: CharacteristicValue,
  ): Promise<void> {
    await this.debugLog(`On: ${value}`);

    this.ProgrammableSwitchOn!.ProgrammableSwitchOutputState = value;
    if (this.ProgrammableSwitchOn?.ProgrammableSwitchOutputState === 1) {
      const On = true;
      await this.pushLightOnChanges(On);
    }
    /**
     * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
     * they are updated, so we are only updating the accessory state after calling the above.
     */
  }

  async ProgrammableSwitchOutputStateSetOff(
    value: CharacteristicValue,
  ): Promise<void> {
    await this.debugLog(`On: ${value}`);

    this.ProgrammableSwitchOff!.ProgrammableSwitchOutputState = value;
    if (this.ProgrammableSwitchOff?.ProgrammableSwitchOutputState === 1) {
      const On = false;
      await this.pushLightOffChanges(On);
    }
    /**
     * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
     * they are updated, so we are only updating the accessory state after calling the above.
     */
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Light -        "command"       "turnOff"         "default"	        =        set to OFF state
   * Light -       "command"       "turnOn"          "default"	        =        set to ON state
   * Light -       "command"       "volumeAdd"       "default"	        =        volume up
   * Light -       "command"       "volumeSub"       "default"	        =        volume down
   * Light -       "command"       "channelAdd"      "default"	        =        next channel
   * Light -       "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushLightOnChanges(On: boolean): Promise<void> {
    await this.debugLog(
      `pushLightOnChanges On: ${On}, disablePushOn: ${this.disablePushOn}`,
    );
    if (On === true && this.disablePushOn === false) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOn();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange, On);
    }
  }

  async pushLightOffChanges(On: boolean): Promise<void> {
    await this.debugLog(
      `pushLightOffChanges On: ${On}, disablePushOff: ${this.disablePushOff}`,
    );
    if (On === false && this.disablePushOff === false) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOff();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange, On);
    }
  }

  async pushBrightnessChanges(): Promise<void> {
    await this.debugLog(
      `pushBrightnessChanges Brightness: ${this.LightBulb!.Brightness}`,
    );
    const commandType: string = 'customize';
    const command: string =
      (this.LightBulb!.Brightness as number) < 50
        ? '常夜灯'
        : (this.LightBulb!.Brightness as number) < 99
          ? '調光１'
          : '全灯';
    const bodyChange = JSON.stringify({
      command: command,
      parameter: 'default',
      commandType: commandType,
    });
    await this.debugLog(
      `(pushBrightnessChanges) SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`,
    );
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange);
          this.accessory.context.On = true;
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        await this.apiError(e);
        await this.pushChangeError(e);
      }
    } else {
      this.warnLog(
        'Connection Type: ' +
          `${this.device.connectionType}, commands will not be sent to OpenAPI`,
      );
    }
  }

  async pushChanges(bodyChange: any, On: boolean): Promise<void> {
    this.debugLog('pushChanges');
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange);
          this.accessory.context.On = On;
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        await this.apiError(e);
        await this.pushChangeError(e);
      }
    } else {
      this.warnLog(
        'Connection Type: ' +
          `${this.device.connectionType}, commands will not be sent to OpenAPI`,
      );
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.debugLog('updateHomeKitCharacteristics');
    if (!this.device.irlight?.stateless && this.LightBulb?.Service) {
      // On
      await this.updateCharacteristic(
        this.LightBulb.Service,
        this.hap.Characteristic.On,
        this.LightBulb.On,
        'On',
      );
      // Brightness
      await this.updateCharacteristic(
        this.LightBulb.Service,
        this.hap.Characteristic.Brightness,
        this.LightBulb.Brightness,
        'Brightness',
      );
    } else {
      if (this.ProgrammableSwitchOn?.Service) {
        // On Stateful Programmable Switch
        await this.updateCharacteristic(
          this.ProgrammableSwitchOn.Service,
          this.hap.Characteristic.ProgrammableSwitchOutputState,
          this.ProgrammableSwitchOn.ProgrammableSwitchOutputState,
          'ProgrammableSwitchOutputState',
        );
      }
      if (this.ProgrammableSwitchOff?.Service) {
        // Off Stateful Programmable Switch
        await this.updateCharacteristic(
          this.ProgrammableSwitchOff.Service,
          this.hap.Characteristic.ProgrammableSwitchOutputState,
          this.ProgrammableSwitchOff.ProgrammableSwitchOutputState,
          'ProgrammableSwitchOutputState',
        );
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.irlight?.stateless) {
      this.LightBulb?.Service.updateCharacteristic(
        this.hap.Characteristic.On,
        e,
      );
      this.LightBulb?.Service.updateCharacteristic(
        this.hap.Characteristic.Brightness,
        e,
      );
    } else {
      this.ProgrammableSwitchOn?.Service.updateCharacteristic(
        this.hap.Characteristic.ProgrammableSwitchEvent,
        e,
      );
      this.ProgrammableSwitchOn?.Service.updateCharacteristic(
        this.hap.Characteristic.ProgrammableSwitchOutputState,
        e,
      );
      this.ProgrammableSwitchOff?.Service.updateCharacteristic(
        this.hap.Characteristic.ProgrammableSwitchEvent,
        e,
      );
      this.ProgrammableSwitchOff?.Service.updateCharacteristic(
        this.hap.Characteristic.ProgrammableSwitchOutputState,
        e,
      );
    }
  }
}
