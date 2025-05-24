type Storage = {
    id: string
    capacity: string
    type: string
}

type Display = {
    name: string
    height: string
    width: string
    isPrimary: boolean
}

export type DeviceInfo = {
    deviceId: string
    operatingSystem: string
    userAgent: string
    cpuModel: string
    cpuArch: string
    cpuNumOfProcessors: number
    primaryDisplay: string
    browser: string
    browserVersion: string
    gpu?: string
    ramSize?: string
    storages?: Array<Storage>
    displays?: Array<Display>
    isVM?: boolean
}

export type ShortcutMatch = {
  shortcut: string;
  desc: string;
};