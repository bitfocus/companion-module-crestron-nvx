import { combineRgb, type CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

function labelLines(lines: string[]): string {
	return lines.join('\\n')
}

function presetText(value: string, fallback: string): string {
	const text = value.trim() || fallback
	return text.length > 20 ? `${text.slice(0, 18)}..` : text
}

const INPUTS_CATEGORY = 'Z Input Select (STREAM/HDMI/USBC)'

function inputSourceLabel(label: string, value: string, portType = ''): string {
	if (value === 'Stream') return 'STREAM'
	const match = (label || value).match(/^input\s*([0-9]+)$/i) ?? value.match(/^Input([0-9]+)$/i)
	if (!match) return label || value
	if (/usb.?c/i.test(portType) || /usb.?c/i.test(label)) return `USBC${match[1]}`
	return `HDMI${match[1]}`
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {
		discover_endpoints: {
			type: 'button',
			category: 'Admin - Discover/Refresh',
			name: 'Discover endpoints',
			style: {
				text: labelLines(['NVX', 'Discover']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(30, 70, 90),
				show_topbar: false,
			},
			steps: [{ down: [{ actionId: 'discover_endpoints', options: {} }], up: [] }],
			feedbacks: [],
		},
		refresh_status: {
			type: 'button',
			category: 'Admin - Discover/Refresh',
			name: 'Refresh status',
			style: {
				text: labelLines(['NVX', 'Refresh']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(45, 45, 45),
				show_topbar: false,
			},
			steps: [{ down: [{ actionId: 'refresh_status', options: {} }], up: [] }],
			feedbacks: [],
		},
	}

	for (const destination of self.getDestinations()) {
		presets[`destination_${destination.host.replace(/[^A-Za-z0-9]+/g, '_')}`] = {
			type: 'button',
			category: 'Destinations (Decoders)',
			name: `Destination ${destination.label}`,
			style: {
				text: labelLines(['DEST', presetText(destination.label, destination.host)]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(35, 65, 120),
				show_topbar: false,
			},
			steps: [
				{
					down: [{ actionId: 'set_active_destination', options: { destination: destination.host } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'active_destination',
					options: { destination: destination.host },
					style: {
						bgcolor: combineRgb(0, 120, 190),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		}
	}

	for (const source of self.sources) {
		const key = source.id.replace(/[^A-Za-z0-9]+/g, '_')
		presets[`source_${key}`] = {
			type: 'button',
			category: 'Sources (Encoders)',
			name: `Route ${source.label}`,
			style: {
				text: labelLines([presetText(source.label, 'Source'), 'AV+USB']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(25, 25, 25),
				show_topbar: false,
			},
			steps: [
				{
					down: [{ actionId: 'route_source_default', options: { source: source.id } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'source_routed_default',
					options: { source: source.id },
					style: {
						bgcolor: combineRgb(0, 145, 80),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		}
	}

	for (const endpoint of self.endpoints) {
		if (!endpoint.isEncoder) continue
		for (const input of endpoint.inputs) {
			const key = `${endpoint.host}_${input.value}`.replace(/[^A-Za-z0-9]+/g, '_')
			const inputChoice = `${endpoint.host}|${input.value}`
			const inputLabel = inputSourceLabel(input.label, input.value, input.portType)
			presets[`input_${key}`] = {
				type: 'button',
				category: INPUTS_CATEGORY,
				name: `Input ${endpoint.label} ${inputLabel}`,
				style: {
					text: labelLines([presetText(endpoint.label, endpoint.host), presetText(inputLabel, input.value)]),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(65, 65, 65),
					show_topbar: false,
				},
				steps: [
					{
						down: [{ actionId: 'set_encoder_input', options: { input: inputChoice } }],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'input_selected',
						options: { input: inputChoice },
						style: {
							bgcolor: combineRgb(0, 145, 80),
							color: combineRgb(255, 255, 255),
						},
					},
				],
			}
		}
	}

	for (const endpoint of self.getDestinations()) {
		const videoSources = [
			{ value: 'Stream', label: 'STREAM', portType: '' },
			...endpoint.inputs.map((input) => ({
				value: input.value,
				label: input.label,
				portType: input.portType,
			})),
		]
		for (const source of videoSources) {
			const key = `${endpoint.host}_${source.value}`.replace(/[^A-Za-z0-9]+/g, '_')
			const sourceChoice = `${endpoint.host}|${source.value}`
			const sourceLabel = inputSourceLabel(source.label, source.value, source.portType)
			presets[`destination_video_source_${key}`] = {
				type: 'button',
				category: INPUTS_CATEGORY,
				name: `Input ${endpoint.label} ${sourceLabel}`,
				style: {
					text: labelLines([presetText(endpoint.label, endpoint.host), presetText(sourceLabel, source.value)]),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: source.value === 'Stream' ? combineRgb(35, 65, 120) : combineRgb(65, 65, 65),
					show_topbar: false,
				},
				steps: [
					{
						down: [{ actionId: 'set_endpoint_video_source', options: { source: sourceChoice } }],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'endpoint_video_source_selected',
						options: { source: sourceChoice },
						style: {
							bgcolor: combineRgb(0, 145, 80),
							color: combineRgb(255, 255, 255),
						},
					},
				],
			}
		}
	}

	for (const endpoint of self.endpoints) {
		const key = endpoint.host.replace(/[^A-Za-z0-9]+/g, '_')
		presets[`admin_${key}_encoder`] = {
			type: 'button',
			category: 'Admin - ENC/DEC Mode Select',
			name: `Set ${endpoint.label} to encoder`,
			style: {
				text: labelLines(['SET ENC', presetText(endpoint.label, endpoint.host)]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(95, 65, 25),
				show_topbar: false,
			},
			steps: [
				{
					down: [{ actionId: 'set_endpoint_mode', options: { endpoint: endpoint.host, mode: 'Transmitter' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'endpoint_mode',
					options: { endpoint: endpoint.host, mode: 'Transmitter' },
					style: {
						bgcolor: combineRgb(0, 145, 80),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		}

		presets[`admin_${key}_decoder`] = {
			type: 'button',
			category: 'Admin - ENC/DEC Mode Select',
			name: `Set ${endpoint.label} to decoder`,
			style: {
				text: labelLines(['SET DEC', presetText(endpoint.label, endpoint.host)]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(55, 70, 120),
				show_topbar: false,
			},
			steps: [
				{
					down: [{ actionId: 'set_endpoint_mode', options: { endpoint: endpoint.host, mode: 'Receiver' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'endpoint_mode',
					options: { endpoint: endpoint.host, mode: 'Receiver' },
					style: {
						bgcolor: combineRgb(0, 145, 80),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		}

		presets[`admin_${key}_usb_device`] = {
			type: 'button',
			category: 'Admin - USB Mode Select',
			name: `Set ${endpoint.label} USB DEVICE (COMPUTER)`,
			style: {
				text: labelLines(['USB DEVICE', '(COMPUTER)']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(85, 55, 115),
				show_topbar: false,
			},
			steps: [
				{
					down: [{ actionId: 'set_usb_mode', options: { endpoint: endpoint.host, mode: 'Local' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'usb_mode',
					options: { endpoint: endpoint.host, mode: 'Local' },
					style: {
						bgcolor: combineRgb(0, 145, 80),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		}

		presets[`admin_${key}_usb_host`] = {
			type: 'button',
			category: 'Admin - USB Mode Select',
			name: `Set ${endpoint.label} USB HOST (USB PERIPHERAL)`,
			style: {
				text: labelLines(['USB HOST', '(PERIPHERAL)']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(40, 95, 105),
				show_topbar: false,
			},
			steps: [
				{
					down: [{ actionId: 'set_usb_mode', options: { endpoint: endpoint.host, mode: 'Remote' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'usb_mode',
					options: { endpoint: endpoint.host, mode: 'Remote' },
					style: {
						bgcolor: combineRgb(0, 145, 80),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		}
	}

	self.setPresetDefinitions(presets)
}
