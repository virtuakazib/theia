/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Disposable } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Terminal, TerminalFactory, TerminalSpawnOptions } from '@theia/process/lib/node';
// eslint-disable-next-line max-len
import { RemoteTerminalAttachOptions, RemoteTerminalAttachResponse, RemoteTerminalGetProcessInfoResponse, RemoteTerminalGetResponse, RemoteTerminalOptions, RemoteTerminalServer, RemoteTerminalSpawnResponse } from '../common/terminal-protocol';
import { RemoteTerminalConnectionHandler } from './remote-terminal-connection-handler';
import { GlobalTerminalRegistry, TerminalRegistry } from './terminal-registry';

@injectable()
export class RemoteTerminalServerImpl implements RemoteTerminalServer, Disposable {

    @inject(RemoteTerminalConnectionHandler)
    protected remoteTerminalConnectionHandler: RemoteTerminalConnectionHandler;

    @inject(GlobalTerminalRegistry)
    protected globalTerminalRegistry: TerminalRegistry;

    @inject(TerminalRegistry)
    protected localTerminalRegistry: TerminalRegistry;

    @inject(TerminalFactory)
    protected terminalFactory: TerminalFactory;

    async spawn(uuid: string, options: RemoteTerminalOptions & TerminalSpawnOptions): Promise<RemoteTerminalSpawnResponse> {
        const rtc = this.remoteTerminalConnectionHandler.get(uuid);
        const terminal = await this.terminalFactory.spawn(options);
        const terminalId = options.persist
            ? this.globalTerminalRegistry.register(terminal) // persist globally
            : this.localTerminalRegistry.register(terminal); // only keep for the current client
        rtc.attach(terminal);
        return {
            terminalId,
            info: terminal.info
        };
    }

    async attach(uuid: string, options: RemoteTerminalAttachOptions): Promise<RemoteTerminalAttachResponse> {
        const rtc = this.remoteTerminalConnectionHandler.get(uuid);
        const terminal = this.getTerminal(options.terminalId);
        rtc.attach(terminal);
        return {
            info: terminal.info
        };
    }

    async getTerminals(): Promise<RemoteTerminalGetResponse[]> {
        const terminals: RemoteTerminalGetResponse[] = [];
        for (const terminalId of this.globalTerminalRegistry.ids()) {
            terminals.push({ terminalId, persistent: true });
        }
        for (const terminalId of this.localTerminalRegistry.ids()) {
            terminals.push({ terminalId, persistent: false });
        }
        return terminals;
    }

    async getTerminalProcessInfo(terminalId: number): Promise<RemoteTerminalGetProcessInfoResponse> {
        const { info } = this.getTerminal(terminalId);
        return { info };
    }

    dispose(): void {
        for (const terminal of this.localTerminalRegistry.terminals()) {
            terminal.kill();
        }
    }

    protected getTerminal(terminalId: number): Terminal {
        const terminal = this.localTerminalRegistry.get(terminalId) ?? this.globalTerminalRegistry.get(terminalId);
        if (terminal === undefined) {
            throw new Error(`terminal not found terminalId: ${terminalId}`);
        }
        return terminal;
    }
}