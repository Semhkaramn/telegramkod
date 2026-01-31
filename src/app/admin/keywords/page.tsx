"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Keyword {
  id: number;
  keyword: string;
}

interface BannedWord {
  id: number;
  word: string;
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [bannedWords, setBannedWords] = useState<BannedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState("");
  const [newBannedWord, setNewBannedWord] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [keywordsRes, bannedRes] = await Promise.all([
        fetch("/api/keywords"),
        fetch("/api/banned-words"),
      ]);

      if (keywordsRes.ok) {
        setKeywords(await keywordsRes.json());
      }
      if (bannedRes.ok) {
        setBannedWords(await bannedRes.json());
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newKeyword.trim().toLowerCase() }),
      });

      if (res.ok) {
        setNewKeyword("");
        fetchData();
      }
    } catch (error) {
      console.error("Error adding keyword:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKeyword = async (id: number) => {
    try {
      const res = await fetch(`/api/keywords?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting keyword:", error);
    }
  };

  const handleAddBannedWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBannedWord.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/banned-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: newBannedWord.trim().toLowerCase() }),
      });

      if (res.ok) {
        setNewBannedWord("");
        fetchData();
      }
    } catch (error) {
      console.error("Error adding banned word:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBannedWord = async (id: number) => {
    try {
      const res = await fetch(`/api/banned-words?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting banned word:", error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-zinc-800" />
        <Skeleton className="h-64 bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Kelime Yonetimi</h1>
        <p className="text-zinc-400">Anahtar kelimeler ve yasak kelimeleri yonetin</p>
      </div>

      <Tabs defaultValue="keywords" className="w-full">
        <TabsList className="bg-zinc-800 border border-zinc-700">
          <TabsTrigger
            value="keywords"
            className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
          >
            Anahtar Kelimeler
          </TabsTrigger>
          <TabsTrigger
            value="banned"
            className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
          >
            Yasak Kelimeler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keywords" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Anahtar Kelimeler</CardTitle>
              <CardDescription className="text-zinc-400">
                Kodların tespit edilmesi icin kullanılan kelimeler
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Form */}
              <form onSubmit={handleAddKeyword} className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  placeholder="Yeni anahtar kelime..."
                />
                <Button
                  type="submit"
                  disabled={submitting || !newKeyword.trim()}
                  className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                >
                  Ekle
                </Button>
              </form>

              {/* Keywords List */}
              <div className="flex flex-wrap gap-2 pt-4">
                {keywords.length === 0 ? (
                  <p className="text-zinc-500">Henuz anahtar kelime yok</p>
                ) : (
                  keywords.map((kw) => (
                    <Badge
                      key={kw.id}
                      className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1.5 text-sm hover:bg-emerald-500/20 cursor-pointer group"
                    >
                      {kw.keyword}
                      <button
                        onClick={() => handleDeleteKeyword(kw.id)}
                        className="ml-2 opacity-50 group-hover:opacity-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banned" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Yasak Kelimeler</CardTitle>
              <CardDescription className="text-zinc-400">
                Bu kelimeleri iceren mesajlar filtrelenir
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Form */}
              <form onSubmit={handleAddBannedWord} className="flex gap-2">
                <Input
                  value={newBannedWord}
                  onChange={(e) => setNewBannedWord(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  placeholder="Yeni yasak kelime..."
                />
                <Button
                  type="submit"
                  disabled={submitting || !newBannedWord.trim()}
                  className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                >
                  Ekle
                </Button>
              </form>

              {/* Banned Words List */}
              <div className="flex flex-wrap gap-2 pt-4">
                {bannedWords.length === 0 ? (
                  <p className="text-zinc-500">Henuz yasak kelime yok</p>
                ) : (
                  bannedWords.map((bw) => (
                    <Badge
                      key={bw.id}
                      className="bg-red-500/10 text-red-400 border-red-500/20 px-3 py-1.5 text-sm hover:bg-red-500/20 cursor-pointer group"
                    >
                      {bw.word}
                      <button
                        onClick={() => handleDeleteBannedWord(bw.id)}
                        className="ml-2 opacity-50 group-hover:opacity-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info Card */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-zinc-300 font-medium">Nasıl calisir?</p>
              <p className="text-sm text-zinc-500 mt-1">
                <span className="text-emerald-400">Anahtar kelimeler</span> mesajlarda kod tespiti icin kullanılır.
                <span className="text-red-400 ml-1">Yasak kelimeler</span> iceren mesajlar ise otomatik olarak filtrelenir ve gonderilmez.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
