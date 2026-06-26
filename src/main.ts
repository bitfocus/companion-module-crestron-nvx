import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { UpdateActions } from './actions.js'
import { GetConfigFields, type DefaultRouteMode, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import {
	buildRouteControlPayload,
	buildRoutePayload,
	buildDeviceModePayload,
	buildHostnamePayload,
	buildInputPayload,
	buildTransmitBitratePayload,
	buildUsbModePayload,
	getRequestOptionsForEndpoint,
	NvxProtocolSession,
	type NvxEndpoint,
	type NvxSource,
	type SignalKind,
} from './protocol.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateVariableDefinitions } from './variables.js'

function boolText(value: boolean | undefined): string {
	return value === undefined ? '' : value ? 'true' : 'false'
}

function truncate(value: string, max = 4000): string {
	return value.length > max ? `${value.slice(0, max)}...` : value
}

function sourceMatches(source: string, expected: string): boolean {
	return !!source && !!expected && source.toLowerCase() === expected.toLowerCase()
}

export class ModuleInstance extends InstanceBase<ModuleConfig, ModuleSecrets> {
	config!: ModuleConfig
	secrets: ModuleSecrets = {}
	endpoints: NvxEndpoint[] = []
	sources: NvxSource[] = []
	isReady = false
	lastError = 'Not connected'
	lastCommand = ''
	lastResponse = ''
	discoverySummary = ''

	private pollTimer: NodeJS.Timeout | undefined
	private discoveryTimer: NodeJS.Timeout | undefined
	private destroyed = false
	private generation = 0
	private refreshInFlight: Promise<void> | undefined
	private discoveryInFlight: Promise<void> | undefined
	private activeDestinationHost = ''
	private definitionSignature = ''
	private readonly protocol = new NvxProtocolSession()

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets ?? {}
		this.destroyed = false
		this.generation += 1
		this.activeDestinationHost = config.activeDestination || ''
		this.protocol.reset()
		this.updateDefinitions(true)
		this.updateVariables()
		await this.start()
	}

	async destroy(): Promise<void> {
		this.destroyed = true
		this.generation += 1
		this.stopPolling()
		this.clearDiscoveryTimer()
		this.refreshInFlight = undefined
		this.discoveryInFlight = undefined
		this.protocol.reset()
		this.isReady = false
		this.updateStatus(InstanceStatus.Disconnected)
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets ?? {}
		this.destroyed = false
		this.generation += 1
		this.stopPolling()
		this.clearDiscoveryTimer()
		this.refreshInFlight = undefined
		this.discoveryInFlight = undefined
		this.activeDestinationHost = config.activeDestination || ''
		this.protocol.reset()
		this.updateDefinitions(true)
		this.updateVariables()
		await this.start()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields(this.getDestinationChoices())
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	getDestinationChoices(): Array<{ id: string; label: string }> {
		return this.getDestinations().map((endpoint) => ({
			id: endpoint.host,
			label: `${endpoint.label} (${endpoint.host})`,
		}))
	}

	getSourceChoices(): Array<{ id: string; label: string }> {
		return this.sources.map((source) => ({
			id: source.id,
			label: `${source.label} (${source.id})`,
		}))
	}

	getInputChoices(): Array<{ id: string; label: string }> {
		const choices: Array<{ id: string; label: string }> = []
		for (const endpoint of this.endpoints) {
			if (!endpoint.isEncoder) continue
			for (const input of endpoint.inputs) {
				choices.push({
					id: this.encodeInputChoice(endpoint.host, input.value),
					label: `${endpoint.label}: ${input.label}`,
				})
			}
		}
		return choices
	}

	getDestinationVideoSourceChoices(): Array<{ id: string; label: string }> {
		const choices: Array<{ id: string; label: string }> = []
		for (const endpoint of this.endpoints) {
			if (!endpoint.isDecoder) continue
			choices.push({
				id: this.encodeInputChoice(endpoint.host, 'Stream'),
				label: `${endpoint.label}: STREAM`,
			})
			for (const input of endpoint.inputs) {
				choices.push({
					id: this.encodeInputChoice(endpoint.host, input.value),
					label: `${endpoint.label}: ${input.label}`,
				})
			}
		}
		return choices
	}

	getEndpointVideoSourceChoices(): Array<{ id: string; label: string }> {
		const choices: Array<{ id: string; label: string }> = []
		for (const endpoint of this.endpoints) {
			if (endpoint.isDecoder) {
				choices.push({
					id: this.encodeInputChoice(endpoint.host, 'Stream'),
					label: `${endpoint.label}: STREAM`,
				})
			}
			if (!endpoint.isEncoder && !endpoint.isDecoder) continue
			for (const input of endpoint.inputs) {
				choices.push({
					id: this.encodeInputChoice(endpoint.host, input.value),
					label: `${endpoint.label}: ${input.label}`,
				})
			}
		}
		return choices
	}

	getDestinations(): NvxEndpoint[] {
		return this.endpoints.filter((endpoint) => endpoint.isDecoder)
	}

	getActiveDestination(): NvxEndpoint | undefined {
		if (this.config.mode === 'endpoint') return this.endpoints[0]
		const selected = this.activeDestinationHost.trim()
		if (selected) return this.endpoints.find((endpoint) => endpoint.host === selected)
		return this.getDestinations()[0]
	}

	getActiveRoute(): ReturnType<NvxEndpoint['routes']['at']> {
		return this.getActiveDestination()?.routes[0]
	}

	getSource(sourceId: string): NvxSource | undefined {
		const id = sourceId.trim().toLowerCase()
		return this.sources.find(
			(source) =>
				source.id.toLowerCase() === id ||
				source.label.toLowerCase() === id ||
				source.sessionName.toLowerCase() === id ||
				source.host.toLowerCase() === id,
		)
	}

	isSourceRouted(sourceId: string, mode: DefaultRouteMode | SignalKind | 'av'): boolean {
		const route = this.getActiveRoute()
		const source = this.getSource(sourceId)
		const id = source?.id ?? sourceId
		if (!route || !id) return false
		if (mode === 'video') return sourceMatches(route.videoSource, id)
		if (mode === 'audio') return sourceMatches(route.audioSource, id)
		if (mode === 'usb') return sourceMatches(route.usbSource, id)
		if (mode === 'av') return sourceMatches(route.videoSource, id) && sourceMatches(route.audioSource, id)
		return (
			sourceMatches(route.videoSource, id) && sourceMatches(route.audioSource, id) && sourceMatches(route.usbSource, id)
		)
	}

	isEndpointDiscovered(host: string): boolean {
		const needle = host.trim().toLowerCase()
		return !!needle && this.endpoints.some((endpoint) => endpoint.host.toLowerCase() === needle)
	}

	isEndpointMode(host: string, mode: 'Transmitter' | 'Receiver'): boolean {
		const needle = host.trim().toLowerCase()
		const endpoint = this.endpoints.find((endpoint) => endpoint.host.toLowerCase() === needle)
		return endpoint?.deviceMode.toLowerCase() === mode.toLowerCase()
	}

	isUsbMode(host: string, mode: 'Local' | 'Remote'): boolean {
		const needle = host.trim().toLowerCase()
		const endpoint = this.endpoints.find((endpoint) => endpoint.host.toLowerCase() === needle)
		return endpoint?.usbMode.toLowerCase() === mode.toLowerCase()
	}

	isInputSelected(choice: string): boolean {
		const selected = this.decodeInputChoice(choice)
		if (!selected) return false
		const endpoint = this.endpoints.find((endpoint) => endpoint.host === selected.host)
		return endpoint?.videoSource === selected.input || endpoint?.activeVideoSource === selected.input
	}

	async start(): Promise<void> {
		const generation = this.generation
		this.stopPolling()
		this.clearDiscoveryTimer()

		if (this.config.mode === 'endpoint' && !(this.config.endpointHost || '').trim()) {
			this.isReady = false
			this.lastError = 'Endpoint host is not configured'
			this.updateStatus(InstanceStatus.BadConfig, this.lastError)
			this.updateVariables()
			return
		}

		if (this.config.mode === 'system' && !(this.config.discoverySubnet || '').trim()) {
			this.isReady = false
			this.lastError = 'Discovery subnet is not configured'
			this.updateStatus(InstanceStatus.BadConfig, this.lastError)
			this.updateVariables()
			return
		}

		this.updateStatus(InstanceStatus.Connecting)
		if (this.config.mode === 'endpoint' || this.config.autoDiscover !== false) {
			this.discoveryTimer = setTimeout(() => {
				this.discoveryTimer = undefined
				if (this.destroyed || generation !== this.generation) return
				const discovery = this.discover()
				this.discoveryInFlight = discovery
				void discovery.finally(() => {
					if (this.discoveryInFlight === discovery) this.discoveryInFlight = undefined
					if (!this.destroyed && generation === this.generation) this.startPolling()
				})
			}, 10)
			return
		}

		this.startPolling()
	}

	async discover(): Promise<void> {
		const generation = this.generation
		this.lastCommand = this.config.mode === 'endpoint' ? 'Read endpoint' : `Discover ${this.config.discoverySubnet}`
		this.updateStatus(InstanceStatus.Connecting, 'Discovering DM NVX endpoints')
		this.updateVariables()

		try {
			const previousSignature = this.getDefinitionSignature()
			const result = await this.protocol.discoverEndpoints(this.config, this.secrets)
			if (this.destroyed || generation !== this.generation) return
			this.endpoints = result.endpoints
			this.rebuildSources()
			const structureChanged = previousSignature !== this.getDefinitionSignature()
			this.discoverySummary = `${result.endpoints.length} endpoint(s) discovered`
			this.lastResponse = this.discoverySummary
			this.lastError =
				result.endpoints.length > 0 ? '' : result.errors.slice(0, 3).join(' | ') || 'No endpoints discovered'
			this.isReady = result.endpoints.length > 0
			this.updateStatus(
				this.isReady ? InstanceStatus.Ok : InstanceStatus.ConnectionFailure,
				this.lastError || undefined,
			)
			this.afterStateChanged(structureChanged)
		} catch (error) {
			this.handleError(error)
		}
	}

	async refreshStatus(): Promise<void> {
		if (this.refreshInFlight) return this.refreshInFlight
		this.refreshInFlight = this.refreshStatusInternal().finally(() => {
			this.refreshInFlight = undefined
		})
		return this.refreshInFlight
	}

	private async refreshStatusInternal(): Promise<void> {
		const generation = this.generation
		if (this.discoveryInFlight) {
			await this.discoveryInFlight
			return
		}
		const current = [...this.endpoints]
		if (current.length === 0) {
			await this.discover()
			return
		}

		this.lastCommand = 'Refresh status'
		try {
			const previousSignature = this.getDefinitionSignature()
			const refreshed = await Promise.all(
				current.map(async (endpoint) =>
					this.protocol.fetchEndpoint(endpoint.host, this.config, this.secrets).catch(() => endpoint),
				),
			)
			if (this.destroyed || generation !== this.generation) return
			this.endpoints = refreshed
			this.rebuildSources()
			const structureChanged = previousSignature !== this.getDefinitionSignature()
			this.isReady = this.endpoints.length > 0
			this.lastResponse = `${this.endpoints.length} endpoint(s) refreshed`
			this.lastError = ''
			this.updateStatus(this.isReady ? InstanceStatus.Ok : InstanceStatus.ConnectionFailure)
			this.afterStateChanged(structureChanged)
		} catch (error) {
			this.handleError(error)
		}
	}

	async setActiveDestination(host: string): Promise<void> {
		const endpoint = this.endpoints.find((endpoint) => endpoint.host === host)
		if (!endpoint) throw new Error(`Destination ${host} is not discovered`)
		this.activeDestinationHost = endpoint.host
		this.lastCommand = `Set active destination ${endpoint.host}`
		this.lastResponse = endpoint.label
		this.afterStateChanged(false)
	}

	async routeSource(sourceId: string, mode: DefaultRouteMode | SignalKind | 'av'): Promise<void> {
		const destination = this.getActiveDestination()
		if (!destination) throw new Error('No active destination is available')
		const source = this.getSource(sourceId)
		const id = source?.id ?? sourceId.trim()
		if (!id) throw new Error('Source is required')

		const requestOptions = getRequestOptionsForEndpoint(destination, this.config, this.secrets)
		const payload = buildRoutePayload(id, mode)
		this.lastCommand = `Route ${mode} ${source?.label ?? id} to ${destination.label}`
		const result = await this.protocol.cresNextPost(requestOptions, '/Device/AvRouting', payload)
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async setRouteControl(kind: 'usb' | 'secondaryAudio', enabled: boolean): Promise<void> {
		const destination = this.getActiveDestination()
		if (!destination) throw new Error('No active destination is available')
		const requestOptions = getRequestOptionsForEndpoint(destination, this.config, this.secrets)
		const payload =
			kind === 'usb'
				? buildRouteControlPayload({ usbFollowsVideo: enabled })
				: buildRouteControlPayload({ secondaryAudioFollowsVideo: enabled })
		this.lastCommand = `Set ${kind} follows video ${enabled ? 'on' : 'off'}`
		const result = await this.protocol.cresNextPost(requestOptions, '/Device/AvRouting', payload)
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async setEndpointMode(host: string, mode: 'Transmitter' | 'Receiver'): Promise<void> {
		const endpoint = this.resolveEndpoint(host)
		const requestOptions = getRequestOptionsForEndpoint(endpoint, this.config, this.secrets)
		this.lastCommand = `Set ${endpoint.host} mode ${mode}`
		const result = await this.protocol.cresNextPost(
			requestOptions,
			'/Device/DeviceSpecific',
			buildDeviceModePayload(mode),
		)
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async setHostname(host: string, name: string): Promise<void> {
		const endpoint = this.resolveEndpoint(host)
		const nextName = name.trim()
		if (!nextName) throw new Error('Hostname is required')
		const requestOptions = getRequestOptionsForEndpoint(endpoint, this.config, this.secrets)
		this.lastCommand = `Set ${endpoint.host} hostname ${nextName}`
		const result = await this.protocol.cresNextPost(
			requestOptions,
			'/Device/DeviceInfo',
			buildHostnamePayload(nextName),
		)
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async setTransmitBitrate(host: string, bitrate: number): Promise<void> {
		const endpoint = this.resolveEndpoint(host)
		const nextBitrate = Math.max(1, Math.min(1000000, Math.round(bitrate)))
		const requestOptions = getRequestOptionsForEndpoint(endpoint, this.config, this.secrets)
		this.lastCommand = `Set ${endpoint.host} transmit bitrate ${nextBitrate}`
		const result = await this.protocol.cresNextPost(
			requestOptions,
			'/Device/StreamTransmit',
			buildTransmitBitratePayload(nextBitrate),
		)
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async setEncoderInput(choice: string): Promise<void> {
		const selected = this.decodeInputChoice(choice)
		if (!selected) throw new Error('Encoder input is required')
		const endpoint = this.endpoints.find((endpoint) => endpoint.host === selected.host)
		if (!endpoint) throw new Error(`Endpoint ${selected.host} is not discovered`)
		const input = endpoint.inputs.find((input) => input.value === selected.input)
		if (!input) throw new Error(`Input ${selected.input} is not available on ${endpoint.host}`)
		const requestOptions = getRequestOptionsForEndpoint(endpoint, this.config, this.secrets)
		this.lastCommand = `Set ${endpoint.host} input ${input.value}`
		const result = await this.protocol.cresNextPost(
			requestOptions,
			'/Device/DeviceSpecific',
			buildInputPayload(input.value),
		)
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async setDestinationVideoSource(choice: string): Promise<void> {
		const selected = this.decodeInputChoice(choice)
		if (!selected) throw new Error('Destination video source is required')
		const endpoint = this.endpoints.find((endpoint) => endpoint.host === selected.host)
		if (!endpoint) throw new Error(`Endpoint ${selected.host} is not discovered`)
		if (!endpoint.isDecoder) throw new Error(`Endpoint ${endpoint.host} is not currently a decoder`)
		const isStream = selected.input === 'Stream'
		const input = endpoint.inputs.find((input) => input.value === selected.input)
		if (!isStream && !input) throw new Error(`Video source ${selected.input} is not available on ${endpoint.host}`)
		const requestOptions = getRequestOptionsForEndpoint(endpoint, this.config, this.secrets)
		this.lastCommand = `Set ${endpoint.host} video source ${input?.label ?? 'STREAM'}`
		const result = await this.protocol.cresNextPost(
			requestOptions,
			'/Device/DeviceSpecific',
			buildInputPayload(selected.input),
		)
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async setEndpointVideoSource(choice: string): Promise<void> {
		const selected = this.decodeInputChoice(choice)
		if (!selected) throw new Error('Endpoint video source is required')
		const endpoint = this.endpoints.find((endpoint) => endpoint.host === selected.host)
		if (!endpoint) throw new Error(`Endpoint ${selected.host} is not discovered`)
		const isStream = selected.input === 'Stream'
		if (isStream && !endpoint.isDecoder) throw new Error('STREAM is only available on decoders')
		const input = endpoint.inputs.find((input) => input.value === selected.input)
		if (!isStream && !input) throw new Error(`Video source ${selected.input} is not available on ${endpoint.host}`)
		const requestOptions = getRequestOptionsForEndpoint(endpoint, this.config, this.secrets)
		this.lastCommand = `Set ${endpoint.host} video source ${input?.label ?? 'STREAM'}`
		const result = await this.protocol.cresNextPost(
			requestOptions,
			'/Device/DeviceSpecific',
			buildInputPayload(selected.input),
		)
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async setUsbMode(host: string, mode: 'Local' | 'Remote'): Promise<void> {
		const endpoint = this.resolveEndpoint(host)
		const requestOptions = getRequestOptionsForEndpoint(endpoint, this.config, this.secrets)
		const label = mode === 'Local' ? 'DEVICE (COMPUTER)' : 'HOST (USB PERIPHERAL)'
		this.lastCommand = `Set ${endpoint.host} USB mode ${label}`
		const result = await this.protocol.cresNextPost(requestOptions, '/Device/Usb', buildUsbModePayload(mode))
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	async rawGet(host: string, path: string): Promise<void> {
		const endpoint = this.resolveEndpoint(host)
		const result = await this.protocol.cresNextGet(
			getRequestOptionsForEndpoint(endpoint, this.config, this.secrets),
			path,
		)
		this.lastCommand = `GET ${endpoint.host} ${path}`
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		this.afterStateChanged(false)
	}

	async rawPostJson(host: string, path: string, json: string): Promise<void> {
		const endpoint = this.resolveEndpoint(host)
		const payload = JSON.parse(json)
		const result = await this.protocol.cresNextPost(
			getRequestOptionsForEndpoint(endpoint, this.config, this.secrets),
			path,
			payload,
		)
		this.lastCommand = `POST ${endpoint.host} ${path}`
		this.lastResponse = truncate(result.rawBody || JSON.stringify(result.body))
		await this.refreshStatus()
	}

	resolveEndpoint(host: string): NvxEndpoint {
		const selected = host.trim()
		if (selected) {
			const endpoint = this.endpoints.find((endpoint) => endpoint.host === selected)
			if (endpoint) return endpoint
			throw new Error(`Endpoint ${selected} is not discovered`)
		}
		const destination = this.getActiveDestination()
		if (!destination) throw new Error('No active destination is available')
		return destination
	}

	updateVariables(): void {
		if (this.destroyed) return
		const destination = this.getActiveDestination()
		const route = destination?.routes[0]
		this.setVariableValues({
			connected: this.isReady ? 'true' : 'false',
			connection_status: this.isReady ? 'Connected' : 'Disconnected',
			last_error: this.lastError,
			last_command: this.lastCommand,
			last_response: this.lastResponse,
			discovery_summary: this.discoverySummary,
			discovered_count: String(this.endpoints.length),
			source_count: String(this.sources.length),
			destination_count: String(this.getDestinations().length),
			active_destination_host: destination?.host ?? '',
			active_destination_name: destination?.label ?? '',
			active_destination_model: destination?.model ?? '',
			active_destination_mode: destination?.deviceMode ?? '',
			active_destination_usb_mode: destination?.usbMode ?? '',
			active_destination_input: destination?.videoSource ?? '',
			active_destination_active_input: destination?.activeVideoSource ?? '',
			video_source: route?.videoSource ?? '',
			audio_source: route?.audioSource ?? '',
			usb_source: route?.usbSource ?? '',
			usb_follows_video: boolText(destination?.usbFollowsVideo),
			secondary_audio_follows_video: boolText(destination?.secondaryAudioFollowsVideo),
			discovered_endpoints: this.endpoints
				.map((endpoint) =>
					`${endpoint.host} ${endpoint.deviceMode || (endpoint.isEncoder ? 'ENC' : '') || (endpoint.isDecoder ? 'DEC' : '')} ${endpoint.label}`.trim(),
				)
				.join(', '),
			discovered_sources: this.sources.map((source) => `${source.label}=${source.id}`).join(', '),
		})
	}

	handleError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error)
		this.lastError = message
		this.isReady = false
		this.log('error', message)
		this.updateStatus(InstanceStatus.ConnectionFailure, message)
		this.afterStateChanged()
	}

	private rebuildSources(): void {
		const sources = new Map<string, NvxSource>()
		for (const endpoint of this.endpoints) {
			if (!endpoint.isEncoder) continue
			for (const source of endpoint.sources) {
				sources.set(source.id, sources.get(source.id) ?? source)
			}
		}
		this.sources = [...sources.values()].sort((a, b) => a.label.localeCompare(b.label))
	}

	private encodeInputChoice(host: string, input: string): string {
		return `${host}|${input}`
	}

	private decodeInputChoice(choice: string): { host: string; input: string } | undefined {
		const [host, input] = choice.split('|', 2)
		if (!host || !input) return undefined
		return { host, input }
	}

	private startPolling(): void {
		this.stopPolling()
		const interval = Math.max(1000, Number(this.config.pollIntervalMs) || 5000)
		this.pollTimer = setInterval(() => {
			void this.refreshStatus()
		}, interval)
	}

	private stopPolling(): void {
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = undefined
	}

	private clearDiscoveryTimer(): void {
		if (this.discoveryTimer) clearTimeout(this.discoveryTimer)
		this.discoveryTimer = undefined
	}

	private getDefinitionSignature(): string {
		return JSON.stringify({
			endpoints: this.endpoints.map((endpoint) => ({
				host: endpoint.host,
				label: endpoint.label,
				isEncoder: endpoint.isEncoder,
				isDecoder: endpoint.isDecoder,
				deviceMode: endpoint.deviceMode,
				inputs: endpoint.inputs.map((input) => `${input.value}:${input.label}:${input.portType}`),
			})),
			sources: this.sources.map((source) => `${source.id}:${source.label}:${source.host}`),
			destinations: this.getDestinations().map((endpoint) => `${endpoint.host}:${endpoint.label}`),
		})
	}

	private updateDefinitions(force = false): void {
		const signature = this.getDefinitionSignature()
		if (!force && signature === this.definitionSignature) return
		this.definitionSignature = signature
		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
	}

	private afterStateChanged(structureChanged = false): void {
		this.updateDefinitions(structureChanged)
		this.updateVariables()
		this.checkFeedbacks(
			'connected',
			'endpoint_discovered',
			'endpoint_mode',
			'usb_mode',
			'active_destination',
			'source_routed_default',
			'video_source_routed',
			'audio_source_routed',
			'usb_source_routed',
			'input_selected',
			'destination_video_source_selected',
			'endpoint_video_source_selected',
			'stream_subscribed',
			'sync_detected',
		)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
