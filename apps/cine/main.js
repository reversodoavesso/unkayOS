// apps/cine/main.js - Cine Hub & Workstation
// Phase 6 deliverable: Film Catalog, Review Studio & Community Curation

import { BaseApp } from '../../core/BaseApp.js';
import { unkay } from '../../core/sdk/unkay.js';

export default class CineApp extends BaseApp {
    constructor(CORE, standardAPIs) {
        super(CORE, standardAPIs);
        this.currentView = 'catalog';
        this.currentGenre = 'all';
        this.searchQuery = '';
        this.selectedMovie = null;
        this.currentRating = 5;
        this.movies = [];
        this.socialFeed = [];
    }

    async onRun() {
        console.log('[Cine] Inicializando Cine Hub...');
        this.initData();
        this.setupEventListeners();
        this.renderCatalog();
        this.renderSocialFeed();
    }

    initData() {
        this.movies = [
            {
                id: 'blade-runner-2049',
                title: 'Blade Runner 2049',
                director: 'Denis Villeneuve',
                year: 2017,
                genre: 'Cyberpunk',
                rating: 4.8,
                synopsis: 'Um jovem blade runner descobre um segredo há muito enterrado que tem o potencial de mergulhar o que resta da sociedade no caos.',
                icon: '🌆'
            },
            {
                id: 'stalker',
                title: 'Stalker',
                director: 'Andrei Tarkovsky',
                year: 1979,
                genre: 'Sci-Fi',
                rating: 4.9,
                synopsis: 'Um guia conduz um escritor e um professor através da misteriosa Zona até uma Sala onde os desejos mais íntimos podem ser realizados.',
                icon: '🌌'
            },
            {
                id: 'the-matrix',
                title: 'The Matrix',
                director: 'Lana & Lilly Wachowski',
                year: 1999,
                genre: 'Cyberpunk',
                rating: 4.7,
                synopsis: 'Um hacker aprende sobre a verdadeira natureza de sua realidade e seu papel na guerra contra seus controladores.',
                icon: '🕶️'
            },
            {
                id: 'the-lighthouse',
                title: 'O Farol',
                director: 'Robert Eggers',
                year: 2019,
                genre: 'Terror',
                rating: 4.6,
                synopsis: 'Dois guardiões de farol tentam manter a sanidade enquanto vivem em uma remota e misteriosa ilha da Nova Inglaterra.',
                icon: '🗼'
            },
            {
                id: 'drive-my-car',
                title: 'Drive My Car',
                director: 'Ryusuke Hamaguchi',
                year: 2021,
                genre: 'Drama',
                rating: 4.8,
                synopsis: 'Um diretor e ator de teatro idoso em luto por sua esposa recebe uma jovem mulher taciturna para ser sua motorista.',
                icon: '🚗'
            }
        ];

        this.socialFeed = [
            {
                author: 'Maicon Slavieiro (Demiurge)',
                movie: 'Stalker (1979)',
                rating: 5,
                time: 'há 2 horas',
                text: 'A imersão filosófica da Zona continua sendo uma das experiências mais densas do cinema. Tarkovsky opera em outra dimensão de tempo.'
            },
            {
                author: 'Adepto Curador',
                movie: 'Blade Runner 2049 (2017)',
                rating: 5,
                time: 'ontem',
                text: 'A fotografia de Roger Deakins combinada à trilha sonora de Zimmer & Wallfisch é arquitetura pura.'
            }
        ];
    }

    setupEventListeners() {
        // Navigation tabs
        this.elements.all('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                this.switchView(view);
            });
        });

        // Search input
        const searchInput = this.$('#cineSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.renderCatalog();
            });
        }

        // Genre chips
        this.elements.all('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.elements.all('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentGenre = chip.dataset.genre;
                this.renderCatalog();
            });
        });

        // Star rating
        this.elements.all('#starRating span').forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.dataset.star, 10);
                this.setRating(val);
            });
        });

        // Editor buttons
        const saveDraftBtn = this.$('#saveDraftVfsBtn');
        const publishBtn = this.$('#publishReviewBtn');

        if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => this.saveReviewDraft());
        if (publishBtn) publishBtn.addEventListener('click', () => this.publishReview());
    }

    switchView(viewName) {
        this.currentView = viewName;
        this.elements.all('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });

        const vCatalog = this.$('#viewCatalog');
        const vEditor = this.$('#viewEditor');
        const vSocial = this.$('#viewSocial');

        if (vCatalog) vCatalog.style.display = viewName === 'catalog' ? 'flex' : 'none';
        if (vEditor) vEditor.style.display = viewName === 'editor' ? 'flex' : 'none';
        if (vSocial) vSocial.style.display = viewName === 'social' ? 'flex' : 'none';
    }

    setRating(val) {
        this.currentRating = val;
        this.elements.all('#starRating span').forEach(s => {
            const starIdx = parseInt(s.dataset.star, 10);
            s.classList.toggle('active', starIdx <= val);
        });
    }

    selectMovieForReview(movie) {
        this.selectedMovie = movie;
        const info = this.$('#selectedMovieInfo');
        if (info) {
            info.innerHTML = `
                <div style="font-weight: 700; color: #f8fafc; font-size: 14px;">${movie.title}</div>
                <div style="font-size: 11px; color: #94a3b8;">${movie.director} (${movie.year}) • ${movie.genre}</div>
            `;
        }

        const titleInput = this.$('#reviewTitleInput');
        if (titleInput && !titleInput.value) {
            titleInput.value = `Impressões sobre ${movie.title}`;
        }

        this.switchView('editor');
    }

    renderCatalog() {
        const grid = this.$('#movieGrid');
        if (!grid) return;

        const filtered = this.movies.filter(m => {
            if (this.currentGenre !== 'all' && m.genre !== this.currentGenre) return false;
            if (this.searchQuery) {
                const q = this.searchQuery;
                if (!m.title.toLowerCase().includes(q) && !m.director.toLowerCase().includes(q)) {
                    return false;
                }
            }
            return true;
        });

        grid.innerHTML = filtered.map(m => `
            <div class="movie-card" data-movie-id="${m.id}">
                <div class="poster-box">${m.icon}</div>
                <h4 class="movie-title">${m.title}</h4>
                <div class="movie-director">${m.director}</div>
                <div class="movie-synopsis">${m.synopsis}</div>
                <div class="movie-footer">
                    <span class="rating-badge">★ ${m.rating}</span>
                    <span class="year-badge">${m.year}</span>
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('.movie-card').forEach(card => {
            card.addEventListener('click', () => {
                const movie = this.movies.find(m => m.id === card.dataset.movieId);
                if (movie) this.selectMovieForReview(movie);
            });
        });
    }

    renderSocialFeed() {
        const feed = this.$('#socialFeed');
        if (!feed) return;

        feed.innerHTML = this.socialFeed.map(item => `
            <div class="feed-item">
                <div class="feed-header">
                    <span class="feed-author">${item.author}</span>
                    <span class="feed-time">${item.time}</span>
                </div>
                <div style="font-size: 12px; font-weight: 600; color: #f8fafc;">
                    ${item.movie} • <span style="color: #fbbf24;">${'★'.repeat(item.rating)}</span>
                </div>
                <div class="feed-text">${item.text}</div>
            </div>
        `).join('');
    }

    async saveReviewDraft() {
        const statusEl = this.$('#editorStatusMsg');
        const title = this.$('#reviewTitleInput').value.trim();
        const content = this.$('#reviewContentInput').value.trim();

        if (!title) {
            alert('Por favor, informe um título para a análise.');
            return;
        }

        try {
            statusEl.textContent = 'Salvando no VFS...';
            const dir = '/home/user/documents/cine/reviews';
            await unkay.fs.mkdir(dir, true);
            const slug = (this.selectedMovie ? this.selectedMovie.id : 'critica') + '-' + Date.now();
            const filePath = `${dir}/${slug}.md`;

            const markdown = `# ${title}\n\n` +
                `**Filme:** ${this.selectedMovie?.title || 'Geral'}\n` +
                `**Avaliação:** ${'★'.repeat(this.currentRating)}\n` +
                `**Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n` +
                content;

            await unkay.fs.writeFile(filePath, markdown);
            statusEl.textContent = `✓ Rascunho salvo em ${filePath}`;
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        } catch (err) {
            console.error('[Cine] Erro ao salvar rascunho:', err);
            statusEl.textContent = 'Erro ao salvar no VFS';
        }
    }

    async publishReview() {
        const statusEl = this.$('#editorStatusMsg');
        const title = this.$('#reviewTitleInput').value.trim();
        const content = this.$('#reviewContentInput').value.trim();

        if (!title || !content) {
            alert('Preencha título e conteúdo antes de publicar.');
            return;
        }

        statusEl.textContent = 'Publicando no Cine Social...';

        // Add to local feed
        this.socialFeed.unshift({
            author: unkay.auth.getUser()?.username || 'Você (unkayOS)',
            movie: this.selectedMovie ? `${this.selectedMovie.title} (${this.selectedMovie.year})` : title,
            rating: this.currentRating,
            time: 'agora',
            text: content.slice(0, 180) + (content.length > 180 ? '...' : '')
        });

        this.renderSocialFeed();
        await this.saveReviewDraft();

        setTimeout(() => {
            statusEl.textContent = '✓ Publicado com sucesso no Cine Social!';
            this.switchView('social');
        }, 500);
    }
}
