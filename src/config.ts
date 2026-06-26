import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleMode = 'system' | 'endpoint'
export type AuthMode = 'auto' | 'https-login' | 'http-no-auth'
export type DefaultRouteMode = 'av-usb' | 'av' | 'video'

export interface ModuleConfig {
	mode: ModuleMode
	endpointHost: string
	knownEndpoints: string
	discoverySubnet: string
	activeDestination: string
	authMode: AuthMode
	username: string
	httpsPort: number
	httpPort: number
	allowSelfSigned: boolean
	autoDiscover: boolean
	scanTimeoutMs: number
	scanConcurrency: number
	requestTimeoutMs: number
	pollIntervalMs: number
	defaultRouteMode: DefaultRouteMode
	sourceAliases: string
}

export interface ModuleSecrets {
	password?: string
}

export function GetConfigFields(
	destinationChoices: Array<{ id: string; label: string }> = [],
): SomeCompanionConfigField[] {
	return [
		{
			type: 'dropdown',
			id: 'mode',
			label: 'Module mode',
			width: 4,
			default: 'system',
			choices: [
				{ id: 'system', label: 'System matrix' },
				{ id: 'endpoint', label: 'Single endpoint' },
			],
			tooltip: 'System matrix scans and controls multiple endpoints. Single endpoint targets one NVX device.',
		},
		{
			type: 'textinput',
			id: 'endpointHost',
			label: 'Endpoint IP / hostname',
			width: 8,
			default: '',
			regex: Regex.HOSTNAME,
			isVisibleExpression: '$(options:mode) == "endpoint"',
			tooltip: 'Used in single endpoint mode.',
		},
		{
			type: 'textinput',
			id: 'discoverySubnet',
			label: 'Discovery subnet',
			width: 8,
			default: '192.168.1.0/24',
			isVisibleExpression: '$(options:mode) == "system"',
			tooltip: 'CIDR subnet scanned for DM NVX endpoints. Keep this focused, for example 192.168.1.0/24.',
		},
		{
			type: 'textinput',
			id: 'knownEndpoints',
			label: 'Known endpoints',
			width: 12,
			default: '',
			isVisibleExpression: '$(options:mode) == "system"',
			tooltip:
				'Optional IPs/hostnames to check directly before scanning. Separate with commas, spaces, or new lines. Example: 192.168.14.226, 192.168.14.105, 192.168.15.223.',
		},
		{
			type: 'dropdown',
			id: 'activeDestination',
			label: 'Active destination',
			width: 4,
			default: '',
			isVisibleExpression: '$(options:mode) == "system"',
			choices:
				destinationChoices.length > 0
					? [{ id: '', label: 'Auto-select first decoder' }, ...destinationChoices]
					: [{ id: '', label: 'No decoders discovered yet' }],
			tooltip: 'Source presets route this decoder by default.',
		},
		{
			type: 'dropdown',
			id: 'authMode',
			label: 'Authentication mode',
			width: 4,
			default: 'auto',
			choices: [
				{ id: 'auto', label: 'Auto: HTTPS login, then no-auth' },
				{ id: 'https-login', label: 'HTTPS login' },
				{ id: 'http-no-auth', label: 'HTTP no-auth' },
			],
		},
		{
			type: 'textinput',
			id: 'username',
			label: 'Username',
			width: 4,
			default: 'admin',
			isVisibleExpression: '$(options:authMode) != "http-no-auth"',
		},
		{
			type: 'secret-text',
			id: 'password',
			label: 'Password',
			width: 4,
			default: '',
			isVisibleExpression: '$(options:authMode) != "http-no-auth"',
		},
		{
			type: 'number',
			id: 'httpsPort',
			label: 'HTTPS port',
			width: 3,
			min: 1,
			max: 65535,
			default: 443,
		},
		{
			type: 'number',
			id: 'httpPort',
			label: 'HTTP port',
			width: 3,
			min: 1,
			max: 65535,
			default: 80,
		},
		{
			type: 'checkbox',
			id: 'allowSelfSigned',
			label: 'Allow self-signed HTTPS certificates',
			width: 6,
			default: true,
		},
		{
			type: 'dropdown',
			id: 'defaultRouteMode',
			label: 'Default source button routing',
			width: 6,
			default: 'av-usb',
			choices: [
				{ id: 'av-usb', label: 'Video + audio + USB' },
				{ id: 'av', label: 'Video + audio' },
				{ id: 'video', label: 'Video only' },
			],
		},
		{
			type: 'checkbox',
			id: 'autoDiscover',
			label: 'Discover on startup',
			width: 3,
			default: true,
			isVisibleExpression: '$(options:mode) == "system"',
		},
		{
			type: 'number',
			id: 'scanConcurrency',
			label: 'Scan concurrency',
			width: 3,
			min: 1,
			max: 64,
			default: 16,
			isVisibleExpression: '$(options:mode) == "system"',
		},
		{
			type: 'number',
			id: 'scanTimeoutMs',
			label: 'Scan timeout (ms)',
			width: 3,
			min: 250,
			max: 10000,
			default: 1200,
			isVisibleExpression: '$(options:mode) == "system"',
		},
		{
			type: 'number',
			id: 'requestTimeoutMs',
			label: 'Request timeout (ms)',
			width: 3,
			min: 500,
			max: 30000,
			default: 5000,
		},
		{
			type: 'number',
			id: 'pollIntervalMs',
			label: 'Poll interval (ms)',
			width: 3,
			min: 1000,
			max: 120000,
			default: 5000,
		},
		{
			type: 'textinput',
			id: 'sourceAliases',
			label: 'Source aliases',
			width: 12,
			default: '',
			tooltip:
				'Optional source labels, one per line as UUID=Label, session name=Label, or host=Label. Used for source choices and presets.',
		},
	]
}
