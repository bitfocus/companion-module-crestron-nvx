import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

async function runAction(self: ModuleInstance, task: () => Promise<void>): Promise<void> {
	try {
		await task()
	} catch (error) {
		self.handleError(error)
	}
}

function onOffToggleChoices(): Array<{ id: string; label: string }> {
	return [
		{ id: 'true', label: 'On' },
		{ id: 'false', label: 'Off' },
	]
}

export function UpdateActions(self: ModuleInstance): void {
	const sourceChoices = self.getSourceChoices()
	const inputChoices = self.getInputChoices()
	const destinationVideoSourceChoices = self.getDestinationVideoSourceChoices()
	const endpointVideoSourceChoices = self.getEndpointVideoSourceChoices()
	const destinationChoices = self.getDestinationChoices()
	const endpointChoices = self.endpoints.map((endpoint) => ({
		id: endpoint.host,
		label: `${endpoint.label} (${endpoint.host})`,
	}))
	const sourceDropdownChoices =
		sourceChoices.length > 0 ? sourceChoices : [{ id: '', label: 'No sources discovered yet' }]
	const inputDropdownChoices =
		inputChoices.length > 0 ? inputChoices : [{ id: '', label: 'No encoder inputs discovered yet' }]
	const destinationVideoSourceDropdownChoices =
		destinationVideoSourceChoices.length > 0
			? destinationVideoSourceChoices
			: [{ id: '', label: 'No decoder video sources discovered yet' }]
	const endpointVideoSourceDropdownChoices =
		endpointVideoSourceChoices.length > 0
			? endpointVideoSourceChoices
			: [{ id: '', label: 'No endpoint video sources discovered yet' }]
	const destinationDropdownChoices =
		destinationChoices.length > 0 ? destinationChoices : [{ id: '', label: 'No destinations discovered yet' }]
	const endpointDropdownChoices =
		endpointChoices.length > 0
			? [{ id: '', label: 'Active destination' }, ...endpointChoices]
			: [{ id: '', label: 'Active destination' }]

	const actions: CompanionActionDefinitions = {
		discover_endpoints: {
			name: 'Discover endpoints',
			options: [],
			callback: async () => {
				await self.discover()
			},
		},
		refresh_status: {
			name: 'Refresh status',
			options: [],
			callback: async () => {
				await self.refreshStatus()
			},
		},
		set_active_destination: {
			name: 'Set active destination',
			options: [
				{
					id: 'destination',
					type: 'dropdown',
					label: 'Destination decoder',
					default: destinationChoices[0]?.id ?? '',
					choices: destinationDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.setActiveDestination(String(action.options.destination ?? ''))
				})
			},
		},
		route_source_default: {
			name: 'Route source using default mode',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.routeSource(String(action.options.source ?? ''), self.config.defaultRouteMode ?? 'av-usb')
				})
			},
		},
		route_video_source: {
			name: 'Route video source only',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.routeSource(String(action.options.source ?? ''), 'video')
				})
			},
		},
		route_audio_source: {
			name: 'Route audio source only',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.routeSource(String(action.options.source ?? ''), 'audio')
				})
			},
		},
		route_usb_source: {
			name: 'Route USB source only',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.routeSource(String(action.options.source ?? ''), 'usb')
				})
			},
		},
		route_av_source: {
			name: 'Route video and audio source',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: sourceChoices[0]?.id ?? '',
					choices: sourceDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.routeSource(String(action.options.source ?? ''), 'av')
				})
			},
		},
		set_encoder_input: {
			name: 'Set encoder input',
			options: [
				{
					id: 'input',
					type: 'dropdown',
					label: 'Encoder input',
					default: inputChoices[0]?.id ?? '',
					choices: inputDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.setEncoderInput(String(action.options.input ?? ''))
				})
			},
		},
		set_destination_video_source: {
			name: 'Set decoder video source: STREAM / local HDMI input',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Decoder video source',
					default: destinationVideoSourceChoices[0]?.id ?? '',
					choices: destinationVideoSourceDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.setDestinationVideoSource(String(action.options.source ?? ''))
				})
			},
		},
		set_endpoint_video_source: {
			name: 'Set endpoint video source / input',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Endpoint video source',
					default: endpointVideoSourceChoices[0]?.id ?? '',
					choices: endpointVideoSourceDropdownChoices,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.setEndpointVideoSource(String(action.options.source ?? ''))
				})
			},
		},
		set_usb_mode: {
			name: 'Set USB mode: DEVICE (COMPUTER) / HOST (USB PERIPHERAL)',
			options: [
				{
					id: 'endpoint',
					type: 'dropdown',
					label: 'Endpoint',
					default: endpointChoices[0]?.id ?? '',
					choices: endpointChoices.length > 0 ? endpointChoices : [{ id: '', label: 'No endpoints discovered yet' }],
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'USB mode',
					default: 'Local',
					choices: [
						{ id: 'Local', label: 'DEVICE (COMPUTER)' },
						{ id: 'Remote', label: 'HOST (USB PERIPHERAL)' },
					],
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					const mode = action.options.mode === 'Remote' ? 'Remote' : 'Local'
					await self.setUsbMode(String(action.options.endpoint ?? ''), mode)
				})
			},
		},
		set_usb_follows_video: {
			name: 'Set USB follows video',
			options: [
				{
					id: 'enabled',
					type: 'dropdown',
					label: 'USB follows video',
					default: 'true',
					choices: onOffToggleChoices(),
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.setRouteControl('usb', action.options.enabled === 'true')
				})
			},
		},
		set_secondary_audio_follows_video: {
			name: 'Set secondary audio follows video',
			options: [
				{
					id: 'enabled',
					type: 'dropdown',
					label: 'Secondary audio follows video',
					default: 'true',
					choices: onOffToggleChoices(),
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.setRouteControl('secondaryAudio', action.options.enabled === 'true')
				})
			},
		},
		set_endpoint_mode: {
			name: 'Admin: set endpoint encoder / decoder mode',
			options: [
				{
					id: 'endpoint',
					type: 'dropdown',
					label: 'Endpoint',
					default: endpointChoices[0]?.id ?? '',
					choices: endpointChoices.length > 0 ? endpointChoices : [{ id: '', label: 'No endpoints discovered yet' }],
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'Receiver',
					choices: [
						{ id: 'Transmitter', label: 'Encoder / Transmitter' },
						{ id: 'Receiver', label: 'Decoder / Receiver' },
					],
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					const mode = action.options.mode === 'Transmitter' ? 'Transmitter' : 'Receiver'
					await self.setEndpointMode(String(action.options.endpoint ?? ''), mode)
				})
			},
		},
		set_hostname: {
			name: 'Admin: set endpoint hostname',
			options: [
				{
					id: 'endpoint',
					type: 'dropdown',
					label: 'Endpoint',
					default: endpointChoices[0]?.id ?? '',
					choices: endpointChoices.length > 0 ? endpointChoices : [{ id: '', label: 'No endpoints discovered yet' }],
				},
				{
					id: 'name',
					type: 'textinput',
					label: 'Hostname',
					default: 'DM-NVX',
					useVariables: true,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					const name = await self.parseVariablesInString(String(action.options.name ?? ''))
					await self.setHostname(String(action.options.endpoint ?? ''), name)
				})
			},
		},
		set_transmit_bitrate: {
			name: 'Admin: set transmit bandwidth / bitrate',
			options: [
				{
					id: 'endpoint',
					type: 'dropdown',
					label: 'Endpoint',
					default: endpointChoices[0]?.id ?? '',
					choices: endpointChoices.length > 0 ? endpointChoices : [{ id: '', label: 'No endpoints discovered yet' }],
				},
				{
					id: 'bitrate',
					type: 'number',
					label: 'Bitrate',
					default: 750,
					min: 1,
					max: 1000000,
					step: 1,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					await self.setTransmitBitrate(String(action.options.endpoint ?? ''), Number(action.options.bitrate ?? 750))
				})
			},
		},
		raw_get: {
			name: 'Raw CresNext GET',
			options: [
				{
					id: 'endpoint',
					type: 'dropdown',
					label: 'Endpoint',
					default: '',
					choices: endpointDropdownChoices,
				},
				{
					id: 'path',
					type: 'textinput',
					label: 'Path',
					default: '/Device/AvRouting',
					useVariables: true,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					const path = await self.parseVariablesInString(String(action.options.path ?? '/Device'))
					await self.rawGet(String(action.options.endpoint ?? ''), path)
				})
			},
		},
		raw_post_json: {
			name: 'Raw CresNext POST JSON',
			options: [
				{
					id: 'endpoint',
					type: 'dropdown',
					label: 'Endpoint',
					default: '',
					choices: endpointDropdownChoices,
				},
				{
					id: 'path',
					type: 'textinput',
					label: 'Path',
					default: '/Device/AvRouting',
					useVariables: true,
				},
				{
					id: 'json',
					type: 'textinput',
					label: 'JSON payload',
					default: '{"Device":{"AvRouting":{"Routes":[{}]}}}',
					useVariables: true,
				},
			],
			callback: async (action) => {
				await runAction(self, async () => {
					const path = await self.parseVariablesInString(String(action.options.path ?? '/Device'))
					const json = await self.parseVariablesInString(String(action.options.json ?? '{}'))
					await self.rawPostJson(String(action.options.endpoint ?? ''), path, json)
				})
			},
		},
	}

	self.setActionDefinitions(actions)
}
