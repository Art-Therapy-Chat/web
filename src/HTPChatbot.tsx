import React, { useState, useRef, useEffect } from 'react';
import { Upload, MessageCircle, Eraser, Pencil } from 'lucide-react';

const HTPChatbot = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('house');
  const [drawings, setDrawings] = useState({
    house: null,
    tree: null,
    person: null
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [interpretation, setInterpretation] = useState('');
  const [houseInterpretation, setHouseInterpretation] = useState('');
  const [treeInterpretation, setTreeInterpretation] = useState('');
  const [personInterpretation, setPersonInterpretation] = useState('');
  const [finalInterpretation, setFinalInterpretation] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [brushSize, setBrushSize] = useState(2);
  const [brushColor, setBrushColor] = useState('#000000');
  
  const canvasRef = useRef(null);
  const [context, setContext] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.strokeStyle = brushColor;
      setContext(ctx);
      
      // 캔버스를 지우고 현재 탭의 그림만 로드
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (drawings[activeTab]) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
        };
        img.src = drawings[activeTab];
      }
    }
  }, [activeTab, brushSize, brushColor, drawings[activeTab]]);

  useEffect(() => {
    // 채팅 메시지가 추가될 때마다 스크롤을 아래로
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    // 2페이지로 이동하면 입력창에 자동 포커스
    if (currentPage === 2 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentPage]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (!context) return;
    setIsDrawing(true);
    const coords = getCoordinates(e);
    context.beginPath();
    context.moveTo(coords.x, coords.y);
  };

  const draw = (e) => {
    if (!isDrawing || !context) return;
    const coords = getCoordinates(e);
    context.lineTo(coords.x, coords.y);
    context.stroke();
  };

  const stopDrawing = () => {
    if (!context) return;
    setIsDrawing(false);
    context.closePath();
    saveCurrentDrawing();
  };

  const saveCurrentDrawing = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL();
      setDrawings(prev => ({
        ...prev,
        [activeTab]: dataUrl
      }));
    }
  };

  const clearCanvas = () => {
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setDrawings(prev => ({
        ...prev,
        [activeTab]: null
      }));
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (context && canvasRef.current) {
            context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            const scale = Math.min(
              canvasRef.current.width / img.width,
              canvasRef.current.height / img.height
            );
            const x = (canvasRef.current.width - img.width * scale) / 2;
            const y = (canvasRef.current.height - img.height * scale) / 2;
            context.drawImage(img, x, y, img.width * scale, img.height * scale);
            saveCurrentDrawing();
          }
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const hasAnyDrawing = () => {
    return drawings.house || drawings.tree || drawings.person;
  };

  const getInterpretation = async () => {
    setIsLoading(true);
    
    const imageContents = [];
    const descriptions = [];
    
    if (drawings.house) {
      imageContents.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: drawings.house.split(',')[1]
        }
      });
      descriptions.push("집 그림");
    }
    if (drawings.tree) {
      imageContents.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: drawings.tree.split(',')[1]
        }
      });
      descriptions.push("나무 그림");
    }
    if (drawings.person) {
      imageContents.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: drawings.person.split(',')[1]
        }
      });
      descriptions.push("사람 그림");
    }

    try {
      // 개별 그림 해석
      if (drawings.house) {
        const houseResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/png",
                      data: drawings.house.split(',')[1]
                    }
                  },
                  {
                    type: "text",
                    text: "이 집 그림을 HTP 검사 관점에서 간단히 해석해주세요. 2-3문장으로 주요 특징만 설명해주세요."
                  }
                ]
              }
            ],
          })
        });
        const houseData = await houseResponse.json();
        setHouseInterpretation(houseData.content[0].text);
      }

      if (drawings.tree) {
        const treeResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/png",
                      data: drawings.tree.split(',')[1]
                    }
                  },
                  {
                    type: "text",
                    text: "이 나무 그림을 HTP 검사 관점에서 간단히 해석해주세요. 2-3문장으로 주요 특징만 설명해주세요."
                  }
                ]
              }
            ],
          })
        });
        const treeData = await treeResponse.json();
        setTreeInterpretation(treeData.content[0].text);
      }

      if (drawings.person) {
        const personResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/png",
                      data: drawings.person.split(',')[1]
                    }
                  },
                  {
                    type: "text",
                    text: "이 사람 그림을 HTP 검사 관점에서 간단히 해석해주세요. 2-3문장으로 주요 특징만 설명해주세요."
                  }
                ]
              }
            ],
          })
        });
        const personData = await personResponse.json();
        setPersonInterpretation(personData.content[0].text);
      }

      // 첫 질문 생성
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: [
                ...imageContents,
                {
                  type: "text",
                  text: `HTP 검사를 위해 추가 정보가 필요합니다. 
첫 번째 질문으로 검사자의 나이를 물어보세요.
친근한 말투로 질문만 작성해주세요.`
                }
              ]
            }
          ],
        })
      });

      const data = await response.json();
      const question = data.content[0].text;
      
      setMessages([{ role: 'assistant', content: question }]);
      setQuestionCount(1);
    } catch (error) {
      console.error(error);
      setMessages([{ role: 'assistant', content: "질문을 생성하는 중 오류가 발생했습니다." }]);
    }
    
    setIsLoading(false);
    setCurrentPage(2);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');
    setIsLoading(true);

    const conversationHistory = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    conversationHistory.push({ role: "user", content: userMessage });

    try {
      // 최종 해석이 완료된 후의 대화
      if (isComplete) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: conversationHistory,
            system: "당신은 친근하고 공감적인 심리상담사입니다. HTP 검사 결과에 대한 사용자의 질문에 따뜻하고 전문적으로 답변해주세요."
          })
        });

        const data = await response.json();
        const assistantMessage = data.content[0].text;
        setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
        setIsLoading(false);
        return;
      }

      // 최종 해석 전의 정보 수집 단계
      const newQuestionCount = questionCount + 1;
      const shouldFinalize = newQuestionCount > 5;

      const imageContents = [];
      if (drawings.house) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.house.split(',')[1]
          }
        });
      }
      if (drawings.tree) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.tree.split(',')[1]
          }
        });
      }
      if (drawings.person) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: drawings.person.split(',')[1]
          }
        });
      }

      if (shouldFinalize) {
        // 최종 해석 생성
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [
              {
                role: "user",
                content: [
                  ...imageContents,
                  {
                    type: "text",
                    text: `당신은 전문 심리상담사입니다. HTP 검사의 최종 해석을 작성해주세요.

지금까지의 대화:
${conversationHistory.map(msg => `${msg.role === 'user' ? '사용자' : '상담사'}: ${msg.content}`).join('\n')}

수집한 정보를 바탕으로 종합적인 HTP 검사 해석을 제공해주세요.

다음을 포함해주세요:
1. 그림에서 관찰되는 주요 특징
2. 검사자의 배경 정보를 고려한 해석
3. 심리적 상태와 특성
4. 긍정적인 측면과 발전 방향

따뜻하고 공감적인 말투로 4-5문단으로 작성해주세요.`
                  }
                ]
              }
            ],
          })
        });

        const data = await response.json();
        const finalText = data.content[0].text;
        setFinalInterpretation(finalText);
        setIsComplete(true);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "최종 해석이 완성되었습니다! 위의 '최종 결과' 섹션을 확인해주세요. 추가로 궁금한 점이 있으시면 언제든 물어보세요." 
        }]);
      } else {
        // 추가 질문 생성
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: [
                  ...imageContents,
                  {
                    type: "text",
                    text: `HTP 검사를 위한 추가 정보 수집 중입니다. (${newQuestionCount}/5)

지금까지의 대화:
${conversationHistory.map(msg => `${msg.role === 'user' ? '사용자' : '상담사'}: ${msg.content}`).join('\n')}

다음 질문을 위한 가이드:
${newQuestionCount === 1 ? '- 성별이나 현재 상황(학생/직장인 등)을 물어보세요.' : ''}
${newQuestionCount === 2 ? '- 최근 기분이나 감정 상태를 물어보세요.' : ''}
${newQuestionCount >= 3 ? '- 그림의 구체적인 요소(색상 선택 이유, 특정 부분에 대한 설명 등)를 물어보세요.' : ''}

친근한 말투로 질문 1개만 작성해주세요.`
                  }
                ]
              }
            ],
          })
        });

        const data = await response.json();
        const question = data.content[0].text;
        setMessages(prev => [...prev, { role: 'assistant', content: question }]);
        setQuestionCount(newQuestionCount);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "응답을 가져오는 중 오류가 발생했습니다. 다시 시도해주세요." 
      }]);
    }
    
    setIsLoading(false);
  };

  const tabNames = {
    house: { ko: '집', en: 'House' },
    tree: { ko: '나무', en: 'Tree' },
    person: { ko: '사람', en: 'Person' }
  };

  if (currentPage === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-purple-600 mb-2">챗쪽이</h1>
            <h2 className="text-2xl text-gray-700">HTP 심리 검사 해석 챗봇</h2>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex gap-2 mb-6">
              {['house', 'tree', 'person'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    saveCurrentDrawing();
                    setActiveTab(tab);
                  }}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    activeTab === tab
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex flex-col items-center">
                    <span>{tabNames[tab].ko}</span>
                    <span className="text-xs opacity-75">{tabNames[tab].en}</span>
                  </div>
                  {drawings[tab] && (
                    <span className="ml-2 text-xs">✓</span>
                  )}
                </button>
              ))}
            </div>

            <div className="mb-4 flex gap-4 items-center bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">브러쉬 크기:</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-32"
                />
                <span className="text-sm text-gray-600 w-8">{brushSize}px</span>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">색상:</label>
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => setBrushColor(e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="mb-4">
              <canvas
                ref={canvasRef}
                width={700}
                height={500}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="border-2 border-gray-300 rounded-lg w-full cursor-crosshair bg-white"
              />
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={clearCanvas}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <Eraser size={20} />
                지우기
              </button>
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer">
                <Upload size={20} />
                이미지 업로드
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={getInterpretation}
              disabled={!hasAnyDrawing() || isLoading}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
                hasAnyDrawing() && !isLoading
                  ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? '분석 중...' : '다음'}
            </button>
            
            {!hasAnyDrawing() && (
              <p className="text-center text-red-500 text-sm mt-2">
                최소 한 가지 그림을 그리거나 업로드해주세요
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-purple-600 mb-2">검사 결과</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {['house', 'tree', 'person'].map((type) => (
              <div key={type} className="text-center">
                <div className="mb-2">
                  <p className="font-semibold text-gray-800">{tabNames[type].ko}</p>
                  <p className="text-xs text-gray-500">{tabNames[type].en}</p>
                </div>
                <div className="border-2 border-gray-200 rounded-lg p-2 bg-gray-50 h-48 flex items-center justify-center">
                  {drawings[type] ? (
                    <img src={drawings[type]} alt={tabNames[type].ko} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <p className="text-gray-400 text-sm">그림 없음</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 개별 해석 */}
          {houseInterpretation && (
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                <MessageCircle className="text-purple-600" size={20} />
                집 해석
              </h3>
              <div className="bg-blue-50 rounded-lg p-3 text-sm">
                {houseInterpretation}
              </div>
            </div>
          )}

          {treeInterpretation && (
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                <MessageCircle className="text-green-600" size={20} />
                나무 해석
              </h3>
              <div className="bg-green-50 rounded-lg p-3 text-sm">
                {treeInterpretation}
              </div>
            </div>
          )}

          {personInterpretation && (
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                <MessageCircle className="text-orange-600" size={20} />
                사람 해석
              </h3>
              <div className="bg-orange-50 rounded-lg p-3 text-sm">
                {personInterpretation}
              </div>
            </div>
          )}

          {/* 최종 결과 */}
          {finalInterpretation && (
            <div className="mt-6">
              <h3 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
                <MessageCircle className="text-purple-600" />
                최종 결과
              </h3>
              <div className="bg-purple-50 rounded-lg p-4 whitespace-pre-wrap">
                {finalInterpretation}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            {isComplete ? '추가 질문' : `추가 정보 수집 (${questionCount}/5)`}
          </h3>
          
          <div className="h-96 overflow-y-auto mb-4 space-y-4 p-4 bg-gray-50 rounded-lg">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 p-3 rounded-lg">
                  <p className="text-gray-500">
                    {questionCount >= 5 ? '최종 해석 생성 중...' : '질문 생성 중...'}
                  </p>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={isComplete ? "궁금한 점을 물어보세요..." : "답변을 입력해주세요..."}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              전송
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            setCurrentPage(1);
            setMessages([]);
            setInterpretation('');
            setHouseInterpretation('');
            setTreeInterpretation('');
            setPersonInterpretation('');
            setFinalInterpretation('');
            setQuestionCount(0);
            setIsComplete(false);
            setDrawings({
              house: null,
              tree: null,
              person: null
            });
            if (context && canvasRef.current) {
              context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          }}
          className="mt-6 w-full py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          처음으로 돌아가기
        </button>
      </div>
    </div>
  );
};

export default HTPChatbot;